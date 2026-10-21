import { app, nativeImage, type NativeImage } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { Worker } from 'node:worker_threads';
import { encodeBmp } from './bmp.js';
import { nowMs } from './clock.js';
import { DesktopWallpaper, initCom } from './desktopWallpaperCom.js';
import type { Monitor } from './desktopWallpaperCom.models.js';
import { ProcessCpuMeter } from './processCpu.js';
import {
  CONTROL_SLOTS,
  SLOT_ARM_SEQ,
  SLOT_MAX_PING_US,
  SLOT_PING_COUNT,
  SLOT_STOP,
  type DesktopWatcherInit,
  type DesktopWatcherMessage,
  type ScreenRegion,
} from './probes.models.js';
import type { ImageFile, ImageSet, ProfileReport, Stage, Trial, Variant } from './profileWallpaper.models.js';

// Profiles an IDesktopWallpaper apply stage by stage, on the Electron main thread,
// the same way main/nativeWallpaper.ts runs it. See README.md next to this file.

const VARIANTS: Variant[] = [
  { input: 'full-jpg', mode: 'per-monitor' },
  { input: 'full-jpg', mode: 'all' },
  { input: 'prescaled-jpg', mode: 'per-monitor' },
  { input: 'full-bmp', mode: 'per-monitor' },
  { input: 'full-bmp', mode: 'all' },
  { input: 'prescaled-bmp', mode: 'per-monitor' },
];

const JPEG_QUALITY = 90;
const TIMEOUT_MS = 15_000;
const PAUSE_BETWEEN_TRIALS_MS = 1_000;
const GRID_WIDTH = 96;
const GRID_HEIGHT = 24;

const { values: args } = parseArgs({
  args: process.argv.slice(app.isPackaged ? 1 : 2),
  options: {
    rounds: { type: 'string', default: '3' },
    settle: { type: 'string', default: '1500' },
    sources: { type: 'string' },
    out: { type: 'string', default: path.join(os.tmpdir(), 'bingwall-profile') },
  },
  strict: false,
});

const rounds = Number(args.rounds);
const settleMs = Number(args.settle);
const outDir = String(args.out);

function variantName(variant: Variant): string {
  return `${variant.input} / ${variant.mode}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function defaultSources(): Promise<string[]> {
  const folder = path.join(os.homedir(), 'Pictures', 'BingWallpapers');
  const jpgs = (await fs.readdir(folder)).filter((name) => name.endsWith('.jpg')).sort();
  if (jpgs.length < 2) {
    throw new Error(`Need two JPGs to alternate between; found ${jpgs.length} in ${folder}. Pass --sources a.jpg,b.jpg`);
  }
  return jpgs.slice(-2).map((name) => path.join(folder, name));
}

async function writeImage(filePath: string, data: Buffer, width: number, height: number): Promise<ImageFile> {
  await fs.writeFile(filePath, data);
  return { path: filePath, bytes: data.length, width, height };
}

// Scale to cover the monitor and centre-crop, which is what DWPOS_FILL does.
function coverTo(image: NativeImage, width: number, height: number): NativeImage {
  const size = image.getSize();
  const scale = Math.max(width / size.width, height / size.height);
  const cropWidth = Math.round(width / scale);
  const cropHeight = Math.round(height / scale);
  const cropped = image.crop({
    x: Math.floor((size.width - cropWidth) / 2),
    y: Math.floor((size.height - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight,
  });
  return cropped.resize({ width, height, quality: 'best' });
}

async function prepareImageSet(source: string, label: string, monitors: Monitor[]): Promise<ImageSet> {
  const image = nativeImage.createFromPath(source);
  if (image.isEmpty()) {
    throw new Error(`Could not decode ${source}`);
  }
  const { width, height } = image.getSize();
  const fullJpg: ImageFile = { path: source, bytes: (await fs.stat(source)).size, width, height };
  const fullBmp = await writeImage(path.join(outDir, `${label}-full.bmp`), encodeBmp(image.toBitmap(), width, height), width, height);

  // Indexed like `monitors`; a detached monitor reuses the first attached monitor's image.
  const prescaledJpg: ImageFile[] = [];
  const prescaledBmp: ImageFile[] = [];
  const attached = monitors.filter((monitor) => monitor.rect);
  for (const monitor of attached) {
    const scaled = coverTo(image, monitor.width, monitor.height);
    const base = path.join(outDir, `${label}-${monitor.width}x${monitor.height}`);
    prescaledJpg.push(await writeImage(`${base}.jpg`, scaled.toJPEG(JPEG_QUALITY), monitor.width, monitor.height));
    prescaledBmp.push(
      await writeImage(`${base}.bmp`, encodeBmp(scaled.toBitmap(), monitor.width, monitor.height), monitor.width, monitor.height),
    );
  }
  const byMonitor = (files: ImageFile[]): ImageFile[] =>
    monitors.map((monitor) => files[Math.max(0, attached.indexOf(monitor))]);

  return { source, fullJpg, fullBmp, prescaledJpg: byMonitor(prescaledJpg), prescaledBmp: byMonitor(prescaledBmp) };
}

function imageFor(set: ImageSet, variant: Variant, monitorIndex: number): ImageFile {
  switch (variant.input) {
    case 'full-jpg':
      return set.fullJpg;
    case 'full-bmp':
      return set.fullBmp;
    case 'prescaled-jpg':
      return set.prescaledJpg[monitorIndex];
    case 'prescaled-bmp':
      return set.prescaledBmp[monitorIndex];
  }
}

function timed<T>(stages: Stage[], name: string, fn: () => T): T {
  const start = nowMs();
  const result = fn();
  stages.push({ name, ms: nowMs() - start });
  return result;
}

// The apply under test: same calls, same order as main/nativeWallpaper.ts, each one timed.
function applyInstrumented(set: ImageSet, variant: Variant): Stage[] {
  const stages: Stage[] = [];
  const wallpaper = timed(stages, 'CoCreateInstance', () => DesktopWallpaper.create());
  try {
    timed(stages, 'SetPosition', () => wallpaper.setPositionFill());
    if (variant.mode === 'all') {
      timed(stages, 'SetWallpaper(NULL)', () => wallpaper.setWallpaper(null, imageFor(set, variant, 0).path));
    } else {
      const count = timed(stages, 'GetMonitorDevicePathCount', () => wallpaper.monitorCount());
      for (let index = 0; index < count; index++) {
        const id = timed(stages, `GetMonitorDevicePathAt(${index})`, () => wallpaper.monitorIdAt(index));
        timed(stages, `SetWallpaper(monitor ${index})`, () => wallpaper.setWallpaper(id, imageFor(set, variant, index).path));
      }
    }
  } finally {
    timed(stages, 'Release', () => wallpaper.release());
  }
  return stages;
}

// Bounding box of all attached monitors, in virtual-screen coordinates.
function desktopRegion(monitors: Monitor[]): ScreenRegion {
  const rects = monitors.flatMap((monitor) => (monitor.rect ? [monitor.rect] : []));
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function nextMessage<T extends DesktopWatcherMessage['type']>(
  worker: Worker,
  type: T,
  seq: number,
): Promise<Extract<DesktopWatcherMessage, { type: T }>> {
  return new Promise((resolve, reject) => {
    const onMessage = (message: DesktopWatcherMessage): void => {
      if (message.type === type && message.seq === seq) {
        worker.off('message', onMessage);
        worker.off('error', reject);
        resolve(message as Extract<DesktopWatcherMessage, { type: T }>);
      }
    };
    worker.on('message', onMessage);
    worker.once('error', reject);
  });
}

function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function fmt(value: number | null): string {
  return value === null ? '–' : value.toFixed(value < 10 ? 1 : 0);
}

function stageSum(trial: Trial, prefix: string): number {
  return trial.stages.filter((stage) => stage.name.startsWith(prefix)).reduce((sum, stage) => sum + stage.ms, 0);
}

function renderMarkdown(report: ProfileReport): string {
  const lines: string[] = [];
  lines.push(`# Wallpaper apply profile — ${report.startedAt}`, '');
  lines.push(`- OS: ${report.os}`, `- Electron: ${report.electron}`, `- Settle window: ${report.settleMs} ms`);
  for (const monitor of report.monitors) {
    lines.push(
      monitor.rect
        ? `- Monitor ${monitor.index}: ${monitor.width}×${monitor.height} at (${monitor.rect.left}, ${monitor.rect.top})`
        : `- Monitor ${monitor.index}: not attached (still gets a SetWallpaper call in per-monitor mode)`,
    );
  }
  for (const set of report.images) {
    const sizes = [set.fullJpg, set.fullBmp, ...set.prescaledJpg, ...set.prescaledBmp]
      .map((file) => `${path.basename(file.path)} ${file.width}×${file.height} ${(file.bytes / 1e6).toFixed(1)} MB`)
      .join('; ');
    lines.push(`- Source ${path.basename(set.source)}: ${sizes}`);
  }

  lines.push('', '## Medians per variant (ms)', '');
  lines.push(
    '| Variant | CoCreateInstance | SetPosition | SetWallpaper total | Main-thread block | First visible change | Settled | Explorer CPU | DWM CPU | Worst Explorer ping | Worst screen-read gap |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  );
  for (const variant of VARIANTS) {
    const trials = report.trials.filter((trial) => trial.round > 0 && trial.variant === variantName(variant));
    const col = (pick: (trial: Trial) => number | null): string =>
      fmt(median(trials.map(pick).filter((value): value is number => value !== null)));
    lines.push(
      `| ${variantName(variant)} | ${col((t) => stageSum(t, 'CoCreateInstance'))} | ${col((t) => stageSum(t, 'SetPosition'))} | ${col((t) => stageSum(t, 'SetWallpaper'))} | ${col((t) => t.blockMs)} | ${col((t) => t.firstVisibleMs)} | ${col((t) => t.settledMs)} | ${col((t) => t.explorerCpuMs)} | ${col((t) => t.dwmCpuMs)} | ${col((t) => t.maxExplorerPingMs)} | ${col((t) => t.maxScreenSampleGapMs)} |`,
    );
  }

  lines.push('', '## All trials (ms)', '');
  lines.push('| # | Variant | Round | Stages | Block | First visible | Settled | Changed points | Explorer CPU | DWM CPU | CPU window | Worst ping | Worst screen-read gap |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  report.trials.forEach((trial, index) => {
    const stages = trial.stages.map((stage) => `${stage.name} ${fmt(stage.ms)}`).join('<br>');
    lines.push(
      `| ${index + 1} | ${trial.variant} | ${trial.round} | ${stages} | ${fmt(trial.blockMs)} | ${fmt(trial.firstVisibleMs)} | ${fmt(trial.settledMs)}${trial.settled ? '' : '+'} | ${trial.changedPoints} | ${fmt(trial.explorerCpuMs)} | ${fmt(trial.dwmCpuMs)} | ${fmt(trial.cpuWindowMs)} | ${fmt(trial.maxExplorerPingMs)} | ${fmt(trial.maxScreenSampleGapMs)} |`,
    );
  });

  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  await app.whenReady();
  await fs.mkdir(outDir, { recursive: true });
  initCom();

  const probe = DesktopWallpaper.create();
  const monitors = probe.monitors();
  const originals = monitors.map((monitor) => (monitor.rect ? probe.getWallpaper(monitor.id) : null));
  probe.release();

  const sources = typeof args.sources === 'string' ? args.sources.split(',') : await defaultSources();
  console.log(`Preparing images from ${sources.join(', ')} …`);
  const images = await Promise.all(sources.slice(0, 2).map((source, index) => prepareImageSet(source, `src${index}`, monitors)));

  const control = new SharedArrayBuffer(CONTROL_SLOTS * Int32Array.BYTES_PER_ELEMENT);
  const ctrl = new Int32Array(control);
  const watcherInit: DesktopWatcherInit = {
    control,
    region: desktopRegion(monitors),
    gridWidth: GRID_WIDTH,
    gridHeight: GRID_HEIGHT,
    settleMs,
    timeoutMs: TIMEOUT_MS,
  };
  const watcher = new Worker(new URL('./desktopWatcher.js', import.meta.url), { workerData: watcherInit });
  const pinger = new Worker(new URL('./explorerPinger.js', import.meta.url), { workerData: { control } });
  for (const worker of [watcher, pinger]) {
    worker.on('error', (error) => console.error('probe worker failed:', error));
  }

  const explorerCpu = new ProcessCpuMeter('explorer.exe');
  const dwmCpu = new ProcessCpuMeter('dwm.exe');
  if (!dwmCpu.available) {
    console.warn('Cannot read dwm.exe CPU times (try an elevated shell); DWM CPU will be reported as –.');
  }

  const report: ProfileReport = {
    startedAt: new Date().toISOString(),
    os: `${os.version()} (${os.release()})`,
    electron: process.versions.electron ?? 'unknown',
    monitors,
    images,
    settleMs,
    trials: [],
  };

  try {
    // Round 0 is a warm-up (cold COM activation, and the current wallpaper may equal
    // a source image); it is listed with the trials but left out of the medians.
    const plan = [
      { round: 0, variant: VARIANTS[0] },
      ...Array.from({ length: rounds }, (_, i) => VARIANTS.map((variant) => ({ round: i + 1, variant }))).flat(),
    ];
    let trialIndex = 0;
    for (const { round, variant } of plan) {
      // Alternate sources so every apply visibly changes the desktop.
      const set = images[(trialIndex + 1) % images.length];
      trialIndex++;

      const seq = Atomics.add(ctrl, SLOT_ARM_SEQ, 1) + 1;
      const armed = nextMessage(watcher, 'armed', seq);
      const result = nextMessage(watcher, 'result', seq);
      await armed;

      const explorerBefore = explorerCpu.cpuMs();
      const dwmBefore = dwmCpu.cpuMs();
      const cpuWindowStart = nowMs();

      const applyStart = nowMs();
      const stages = applyInstrumented(set, variant);
      const blockMs = nowMs() - applyStart;

      const watched = await result;
      const cpuWindowMs = nowMs() - cpuWindowStart;

      const trial: Trial = {
        variant: variantName(variant),
        round,
        source: path.basename(set.source),
        stages,
        blockMs,
        firstVisibleMs: watched.firstChangeAtMs === null ? null : watched.firstChangeAtMs - applyStart,
        settledMs: watched.lastChangeAtMs === null ? null : watched.lastChangeAtMs - applyStart,
        settled: watched.settled,
        changedPoints: watched.changedPoints,
        explorerCpuMs: explorerCpu.available ? explorerCpu.cpuMs() - explorerBefore : null,
        dwmCpuMs: dwmCpu.available ? dwmCpu.cpuMs() - dwmBefore : null,
        cpuWindowMs,
        maxExplorerPingMs: Atomics.load(ctrl, SLOT_MAX_PING_US) / 1000,
        explorerPings: Atomics.load(ctrl, SLOT_PING_COUNT),
        maxScreenSampleMs: watched.maxSampleMs,
        maxScreenSampleGapMs: watched.maxSampleGapMs,
        screenSamples: watched.samples,
        timeline: watched.timeline.map(([at, fromBaseline, fromPrevious]) => [at - applyStart, fromBaseline, fromPrevious]),
      };
      report.trials.push(trial);
      console.log(
        `[${trialIndex}] ${trial.variant}: block ${fmt(blockMs)} ms, visible ${fmt(trial.firstVisibleMs)} ms, settled ${fmt(trial.settledMs)} ms`,
      );

      await delay(PAUSE_BETWEEN_TRIALS_MS);
    }
  } finally {
    const restore = DesktopWallpaper.create();
    monitors.forEach((monitor, index) => {
      const original = originals[index];
      if (original) {
        restore.setWallpaper(monitor.id, original);
      }
    });
    restore.release();

    Atomics.store(ctrl, SLOT_STOP, 1);
    explorerCpu.close();
    dwmCpu.close();
  }

  const stamp = report.startedAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(outDir, `profile-${stamp}.json`);
  const mdPath = path.join(outDir, `profile-${stamp}.md`);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(mdPath, renderMarkdown(report));
  console.log(`\nWrote ${jsonPath}\nWrote ${mdPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => app.quit());
