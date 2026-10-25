import { app, nativeImage, utilityProcess, type NativeImage } from 'electron';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Worker } from 'node:worker_threads';
import type { ApplyOutcome } from '../../main/applier/applier.models.js';
import { createApplierClient } from './applierClient.js';
import type { ApplierClient } from './applierClient.models.js';
import { encodeBmp } from './bmp.js';
import { burstOffsets, evaluateBurst, summariseBursts } from './burst.js';
import type { BurstRequest, BurstTrial } from './burst.models.js';
import { nowMs } from './clock.js';
import { DesktopWallpaper, initCom } from './desktopWallpaperCom.js';
import {
  ActiveDesktop,
  readUserDword,
  readUserString,
  setFillStyleInRegistry,
  systemParametersInfoSetWallpaper,
} from './legacyWallpaper.js';
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
import type { Environment, ImageFile, ImageSet, ProfileReport, Stage, Trial, Variant } from './profileWallpaper.models.js';
import { summarise } from './summary.js';

// Profiles a wallpaper apply stage by stage. The baseline variants make the OS calls on the
// Electron main thread, the way the app ran them before #45 (the removed main/nativeWallpaper.ts);
// the `utility` variant and --burst go through the app's real applier child. See README.md next to this file.

const VARIANTS: Variant[] = [
  { input: 'full-jpg', mode: 'per-monitor' },
  { input: 'full-jpg', mode: 'all' },
  { input: 'prescaled-jpg', mode: 'per-monitor' },
  { input: 'full-bmp', mode: 'per-monitor' },
  { input: 'full-bmp', mode: 'all' },
  { input: 'prescaled-bmp', mode: 'per-monitor' },
  { input: 'full-jpg', mode: 'spi' },
  { input: 'full-jpg', mode: 'active-desktop' },
  { input: 'full-jpg', mode: 'utility' },
];

// Processes known to react to wallpaper or accent-colour changes (RGB sync, wallpaper tools).
const WALLPAPER_LISTENERS = ['SignalRgb.exe', 'SignalRgbService.exe', 'lghub_agent.exe', 'logi_lamparray_service.AMD64.exe', 'BingWallpaper.exe', 'wallpaper64.exe', 'Lively.exe'];

const ACCENT_KEY = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Accent';

const JPEG_QUALITY = 90;
const TIMEOUT_MS = 15_000;
const PAUSE_BETWEEN_TRIALS_MS = 1_000;
const GRID_WIDTH = 96;
const GRID_HEIGHT = 24;
// How long to wait for the applier child to answer before counting a request as unanswered.
const REPLY_TIMEOUT_MS = 15_000;

// Compiled to dist-profile/scripts/profile-wallpaper/, three levels below the project root.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const { values: args } = parseArgs({
  args: process.argv.slice(app.isPackaged ? 1 : 2),
  options: {
    rounds: { type: 'string', default: '3' },
    settle: { type: 'string', default: '1500' },
    sources: { type: 'string' },
    // Where the reports go; generated images always go to %TEMP%\bingwall-profile.
    out: { type: 'string', default: path.join(projectRoot, 'scripts', 'profile-wallpaper', 'results') },
    // Comma-separated variant names without spaces, e.g. full-jpg/per-monitor,full-jpg/spi
    variants: { type: 'string' },
    // Names the machine state of this run in the report, e.g. "signalrgb-off".
    label: { type: 'string', default: 'default' },
    // Simulates holding an arrow key through history: rapid applies through the applier child.
    burst: { type: 'boolean', default: false },
    'burst-rate': { type: 'string', default: '30' },
    'burst-duration': { type: 'string', default: '3000' },
    // The compiled applier child to fork (npm run build:ts builds it).
    applier: { type: 'string', default: path.join(projectRoot, 'dist', 'main', 'applier', 'applierChild.js') },
  },
  strict: false,
});

const rounds = Number(args.rounds);
const settleMs = Number(args.settle);
const outDir = String(args.out);
const scratchDir = path.join(os.tmpdir(), 'bingwall-profile');
const burstMode = args.burst === true;
const burstRate = Number(args['burst-rate']);
const burstDurationMs = Number(args['burst-duration']);

function variantName(variant: Variant): string {
  return `${variant.input} / ${variant.mode}`;
}

const selectedVariants =
  typeof args.variants === 'string'
    ? VARIANTS.filter((variant) => (args.variants as string).split(',').includes(variantName(variant).replace(/ /g, '')))
    : VARIANTS;
if (selectedVariants.length === 0) {
  throw new Error(`--variants matched nothing; known: ${VARIANTS.map((v) => variantName(v).replace(/ /g, '')).join(', ')}`);
}

function runningListeners(): string[] {
  return WALLPAPER_LISTENERS.filter((image) => {
    const meter = new ProcessCpuMeter(image);
    const running = meter.available;
    meter.close();
    return running;
  });
}

function captureEnvironment(): Environment {
  return {
    label: String(args.label),
    autoColorization: readUserDword('Control Panel\\Desktop', 'AutoColorization'),
    transparency: readUserDword('Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', 'EnableTransparency'),
    dynamicLighting: readUserDword('Software\\Microsoft\\Lighting', 'AmbientLightingEnabled'),
    dynamicLightingUsesAccent: readUserDword('Software\\Microsoft\\Lighting', 'UseSystemAccentColor'),
    wallpaperListeners: runningListeners(),
  };
}

function accentColor(): number | null {
  return readUserDword(ACCENT_KEY, 'AccentColorMenu');
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
  const fullBmp = await writeImage(path.join(scratchDir, `${label}-full.bmp`), encodeBmp(image.toBitmap(), width, height), width, height);

  // Indexed like `monitors`; a detached monitor reuses the first attached monitor's image.
  const prescaledJpg: ImageFile[] = [];
  const prescaledBmp: ImageFile[] = [];
  const attached = monitors.filter((monitor) => monitor.rect);
  for (const monitor of attached) {
    const scaled = coverTo(image, monitor.width, monitor.height);
    const base = path.join(scratchDir, `${label}-${monitor.width}x${monitor.height}`);
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

// The apply under test: same calls, same order as the removed main/nativeWallpaper.ts, each one timed.
// Stages are pushed as they finish, so a failing call still leaves the earlier timings.
function applyInstrumented(set: ImageSet, variant: Variant, stages: Stage[]): void {
  const imagePath = imageFor(set, variant, 0).path;

  if (variant.mode === 'spi') {
    timed(stages, 'Registry WallpaperStyle', () => setFillStyleInRegistry());
    timed(stages, 'SystemParametersInfo', () => systemParametersInfoSetWallpaper(imagePath));
    return;
  }

  if (variant.mode === 'active-desktop') {
    const activeDesktop = timed(stages, 'CoCreateInstance(ActiveDesktop)', () => ActiveDesktop.create());
    try {
      timed(stages, 'SetWallpaper', () => activeDesktop.setWallpaper(imagePath));
      timed(stages, 'SetWallpaperOptions', () => activeDesktop.setStyleFill());
      timed(stages, 'ApplyChanges', () => activeDesktop.applyChanges());
    } finally {
      timed(stages, 'Release', () => activeDesktop.release());
    }
    return;
  }

  const wallpaper = timed(stages, 'CoCreateInstance', () => DesktopWallpaper.create());
  try {
    timed(stages, 'SetPosition', () => wallpaper.setPositionFill());
    if (variant.mode === 'all') {
      timed(stages, 'SetWallpaper(NULL)', () => wallpaper.setWallpaper(null, imagePath));
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
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, delay(ms).then(() => null)]);
}

function describeOutcome(outcome: ApplyOutcome | null): string | null {
  if (outcome === null) {
    return `no reply from the applier child within ${REPLY_TIMEOUT_MS} ms`;
  }
  if (outcome.kind === 'error') {
    return `${outcome.error}${outcome.code === undefined ? '' : ` (code ${outcome.code})`}${outcome.message ? `: ${outcome.message}` : ''}`;
  }
  return outcome.kind === 'applied' ? null : outcome.kind;
}

// The `utility` variant: one apply message to the real applier child. Only the postMessage
// runs on this (Electron main) thread; the reply arrives when the child's SPI call returned.
async function applyThroughChild(client: ApplierClient, imagePath: string, stages: Stage[]): Promise<{ blockMs: number; error: string | null }> {
  const start = nowMs();
  const reply = client.apply(imagePath);
  const blockMs = nowMs() - start;
  stages.push({ name: 'postMessage', ms: blockMs });
  const outcome = await withTimeout(reply, REPLY_TIMEOUT_MS);
  stages.push({ name: `reply (${outcome?.kind ?? 'none'})`, ms: nowMs() - start });
  return { blockMs, error: describeOutcome(outcome) };
}

async function startApplier(childPath: string): Promise<{ client: ApplierClient; capabilities: NonNullable<ProfileReport['applier']>['capabilities'] }> {
  try {
    await fs.access(childPath);
  } catch {
    throw new Error(`Applier child not found at ${childPath}. Run npm run build:ts first, or pass --applier <path>.`);
  }
  const client = createApplierClient(utilityProcess.fork(childPath, [], { serviceName: 'BingWall wallpaper applier (profiler)' }));
  // The child loads its backend (koffi) before it listens, so this reply means it's warm.
  const capabilities = await withTimeout(client.capabilities(), REPLY_TIMEOUT_MS);
  if (!capabilities) {
    client.close();
    throw new Error(`The applier child at ${childPath} didn't answer within ${REPLY_TIMEOUT_MS} ms`);
  }
  return { client, capabilities };
}

// One distinct path per burst request (hard links, or copies across volumes), alternating
// between the two sources, so the wallpaper Windows ends up with names exactly one request.
async function prepareBurstFiles(images: ImageSet[], count: number): Promise<string[]> {
  const folder = path.join(scratchDir, 'burst');
  await fs.rm(folder, { recursive: true, force: true });
  await fs.mkdir(folder, { recursive: true });
  const paths: string[] = [];
  for (let index = 0; index < count; index++) {
    const source = images[index % images.length].fullJpg.path;
    const target = path.join(folder, `burst-${String(index).padStart(3, '0')}${path.extname(source)}`);
    try {
      await fs.link(source, target);
    } catch {
      await fs.copyFile(source, target);
    }
    paths.push(target);
  }
  return paths;
}

async function delayUntil(targetMs: number): Promise<void> {
  const wait = targetMs - nowMs();
  if (wait > 0) {
    await delay(wait);
  }
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

function fmt(value: number | null): string {
  return value === null ? '–' : value.toFixed(value < 10 ? 1 : 0);
}

function renderTrials(report: ProfileReport, lines: string[]): void {
  lines.push('', '## Per variant (ms)', '');
  lines.push(
    'Medians, except the worst-case columns. The worst Explorer hang is the longest `WM_NULL` round-trip to `Progman` in any trial.',
    '',
    '| Variant | Main-thread block | First visible change | First visible change (worst) | Settled | Explorer CPU | DWM CPU | Worst Explorer ping | Worst Explorer hang (max) | Worst screen-read gap | Accent changed |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  );
  for (const variant of selectedVariants) {
    const trials = report.trials.filter((trial) => trial.round > 0 && trial.variant === variantName(variant));
    const of = (pick: (trial: Trial) => number | null) => summarise(trials.map(pick));
    const med = (pick: (trial: Trial) => number | null): string => fmt(of(pick).median);
    const worst = (pick: (trial: Trial) => number | null): string => fmt(of(pick).worst);
    lines.push(
      `| ${variantName(variant)} | ${med((t) => t.blockMs)} | ${med((t) => t.firstVisibleMs)} | ${worst((t) => t.firstVisibleMs)} | ${med((t) => t.settledMs)} | ${med((t) => t.explorerCpuMs)} | ${med((t) => t.dwmCpuMs)} | ${med((t) => t.maxExplorerPingMs)} | ${worst((t) => t.maxExplorerPingMs)} | ${med((t) => t.maxScreenSampleGapMs)} | ${trials.filter((t) => t.accentChanged).length}/${trials.length} |`,
    );
  }

  lines.push('', '## All trials (ms)', '');
  lines.push('| # | Variant | Round | Stages | Block | First visible | Settled | Changed points | Explorer CPU | DWM CPU | CPU window | Worst ping | Worst screen-read gap |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  report.trials.forEach((trial, index) => {
    const stages = [...trial.stages.map((stage) => `${stage.name} ${fmt(stage.ms)}`), ...(trial.error ? [`**${trial.error}**`] : [])].join('<br>');
    lines.push(
      `| ${index + 1} | ${trial.variant} | ${trial.round} | ${stages} | ${fmt(trial.blockMs)} | ${fmt(trial.firstVisibleMs)} | ${fmt(trial.settledMs)}${trial.settled ? '' : '+'} | ${trial.changedPoints} | ${fmt(trial.explorerCpuMs)} | ${fmt(trial.dwmCpuMs)} | ${fmt(trial.cpuWindowMs)} | ${fmt(trial.maxExplorerPingMs)} | ${fmt(trial.maxScreenSampleGapMs)} |`,
    );
  });
}

function renderBursts(report: ProfileReport, lines: string[]): void {
  if (!report.burst) {
    return;
  }
  const { ratePerSecond, durationMs, summary } = report.burst;
  lines.push('', `## Burst: ${ratePerSecond} requests/s for ${durationMs} ms through the applier child`, '');
  lines.push(
    `- **Worst Explorer hang: ${fmt(summary.worstExplorerHangMs)} ms** (over all ${summary.bursts} bursts)`,
    `- **Last image wins: ${summary.lastImageWins ? 'PASS' : 'FAIL'}** (${summary.passed}/${summary.bursts} bursts ended on their last requested image)`,
    '',
    'Times in ms. "Landed" is `HKCU\\Control Panel\\Desktop\\Wallpaper` read after the desktop settled.',
    '',
    '| Round | Requests | Applied | Superseded | Errors | Unanswered | Worst post | First visible | Settled after last request | Worst Explorer hang | Worst screen-read gap | Explorer CPU | Accent changed | Last requested | Landed | Last image wins |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  );
  for (const burst of report.bursts) {
    const { verdict } = burst;
    const name = (value: string | null): string => (value === null ? '–' : path.basename(value));
    lines.push(
      `| ${burst.round} | ${verdict.requests} | ${verdict.applied} | ${verdict.superseded} | ${verdict.errors} | ${verdict.unanswered} | ${fmt(burst.maxPostMs)} | ${fmt(burst.firstVisibleMs)} | ${fmt(burst.settledAfterLastMs)}${burst.settled ? '' : '+'} | ${fmt(burst.maxExplorerPingMs)} | ${fmt(burst.maxScreenSampleGapMs)} | ${fmt(burst.explorerCpuMs)} | ${burst.accentChanged ? 'yes' : 'no'} | ${name(verdict.lastRequestedPath)} | ${name(verdict.landedPath)} | ${verdict.lastImageWins ? 'PASS' : '**FAIL**'} |`,
    );
  }
}

function renderMarkdown(report: ProfileReport): string {
  const lines: string[] = [];
  lines.push(`# Wallpaper apply profile — ${report.startedAt}`, '');
  lines.push(`- OS: ${report.os}`, `- Electron: ${report.electron}`, `- Settle window: ${report.settleMs} ms`);
  const env = report.environment;
  lines.push(
    `- Environment "${env.label}": AutoColorization=${env.autoColorization}, transparency=${env.transparency}, Dynamic Lighting=${env.dynamicLighting} (uses accent: ${env.dynamicLightingUsesAccent}), running: ${env.wallpaperListeners.join(', ') || 'none'}`,
  );
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
  if (report.applier) {
    const caps = report.applier.capabilities;
    lines.push(
      `- Applier child: ${report.applier.childPath} (backend ${caps.backend}, perMonitor=${caps.perMonitor}, coversAllWorkspaces=${caps.coversAllWorkspaces}, persistsWithoutApp=${caps.persistsWithoutApp})`,
    );
  }

  if (report.trials.length > 0) {
    renderTrials(report, lines);
  }
  renderBursts(report, lines);

  return `${lines.join('\n')}\n`;
}

type Probes = {
  ctrl: Int32Array;
  watcher: Worker;
  explorerCpu: ProcessCpuMeter;
  dwmCpu: ProcessCpuMeter;
};

// Starts a measurement window: resolves once the watcher has its baseline, with the pending result.
async function arm(probes: Probes): Promise<Promise<Extract<DesktopWatcherMessage, { type: 'result' }>>> {
  const seq = Atomics.add(probes.ctrl, SLOT_ARM_SEQ, 1) + 1;
  const armed = nextMessage(probes.watcher, 'armed', seq);
  const result = nextMessage(probes.watcher, 'result', seq);
  await armed;
  return result;
}

async function runTrials(report: ProfileReport, images: ImageSet[], probes: Probes, client: ApplierClient | null): Promise<void> {
  const { ctrl, explorerCpu, dwmCpu } = probes;
  // Round 0 is a warm-up (cold COM activation, and the current wallpaper may equal
  // a source image); it is listed with the trials but left out of the medians.
  const plan = [
    { round: 0, variant: selectedVariants[0] },
    ...Array.from({ length: rounds }, (_, i) => selectedVariants.map((variant) => ({ round: i + 1, variant }))).flat(),
  ];
  let trialIndex = 0;
  for (const { round, variant } of plan) {
    // Alternate sources so every apply visibly changes the desktop.
    const set = images[(trialIndex + 1) % images.length];
    trialIndex++;

    const result = await arm(probes);

    const accentBefore = accentColor();
    const explorerBefore = explorerCpu.cpuMs();
    const dwmBefore = dwmCpu.cpuMs();
    const cpuWindowStart = nowMs();

    const applyStart = nowMs();
    const stages: Stage[] = [];
    let error: string | null = null;
    let blockMs: number;
    if (variant.mode === 'utility') {
      if (!client) {
        throw new Error('The utility variant needs the applier child');
      }
      ({ blockMs, error } = await applyThroughChild(client, imageFor(set, variant, 0).path, stages));
    } else {
      try {
        applyInstrumented(set, variant, stages);
      } catch (failure) {
        error = failure instanceof Error ? failure.message : String(failure);
      }
      blockMs = nowMs() - applyStart;
    }

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
      accentChanged: accentColor() !== accentBefore,
      error,
    };
    report.trials.push(trial);
    console.log(
      `[${trialIndex}] ${trial.variant}: block ${fmt(blockMs)} ms, visible ${fmt(trial.firstVisibleMs)} ms, settled ${fmt(trial.settledMs)} ms${error ? `, FAILED: ${error}` : ''}`,
    );

    await delay(PAUSE_BETWEEN_TRIALS_MS);
  }
}

// --burst: each round holds an "arrow key" for burstDurationMs, sending an apply every
// 1/burstRate s with no debounce, as the renderer does when sliding through history.
async function runBursts(report: ProfileReport, images: ImageSet[], probes: Probes, client: ApplierClient): Promise<void> {
  const { ctrl, explorerCpu } = probes;
  const offsets = burstOffsets(burstRate, burstDurationMs);
  if (offsets.length === 0) {
    throw new Error('--burst-rate and --burst-duration give no requests');
  }
  const paths = await prepareBurstFiles(images, offsets.length);

  for (let round = 1; round <= rounds; round++) {
    const result = await arm(probes);
    const accentBefore = accentColor();
    const explorerBefore = explorerCpu.cpuMs();

    const start = nowMs();
    const requests: BurstRequest[] = [];
    const replies: Promise<void>[] = [];
    let maxPostMs = 0;
    for (const [index, offset] of offsets.entries()) {
      await delayUntil(start + offset);
      const sentAt = nowMs();
      const request: BurstRequest = { path: paths[index], sentAtMs: sentAt - start, outcome: null, repliedAtMs: null };
      requests.push(request);
      const reply = client.apply(request.path);
      maxPostMs = Math.max(maxPostMs, nowMs() - sentAt);
      replies.push(
        reply.then((outcome) => {
          request.outcome = outcome;
          request.repliedAtMs = nowMs() - start;
        }),
      );
    }
    const lastSentAt = start + requests[requests.length - 1].sentAtMs;

    await withTimeout(Promise.all(replies), REPLY_TIMEOUT_MS);
    const watched = await result;
    const landed = readUserString('Control Panel\\Desktop', 'Wallpaper');

    const burst: BurstTrial = {
      round,
      // A snapshot: a request still unanswered keeps outcome null in the report.
      requests: requests.map((request) => ({ ...request })),
      verdict: evaluateBurst(requests, landed),
      maxPostMs,
      firstVisibleMs: watched.firstChangeAtMs === null ? null : watched.firstChangeAtMs - start,
      settledAfterLastMs: watched.lastChangeAtMs === null ? null : watched.lastChangeAtMs - lastSentAt,
      settled: watched.settled,
      maxExplorerPingMs: Atomics.load(ctrl, SLOT_MAX_PING_US) / 1000,
      explorerPings: Atomics.load(ctrl, SLOT_PING_COUNT),
      maxScreenSampleGapMs: watched.maxSampleGapMs,
      explorerCpuMs: explorerCpu.available ? explorerCpu.cpuMs() - explorerBefore : null,
      accentChanged: accentColor() !== accentBefore,
    };
    report.bursts.push(burst);
    const { verdict } = burst;
    console.log(
      `[burst ${round}] ${verdict.requests} requests: ${verdict.applied} applied, ${verdict.superseded} superseded, ${verdict.errors} errors, ${verdict.unanswered} unanswered; worst Explorer hang ${fmt(burst.maxExplorerPingMs)} ms; last image wins: ${verdict.lastImageWins ? 'PASS' : 'FAIL'}`,
    );

    await delay(PAUSE_BETWEEN_TRIALS_MS);
  }

  report.burst = { ratePerSecond: burstRate, durationMs: burstDurationMs, summary: summariseBursts(report.bursts) };
}

async function main(): Promise<void> {
  await app.whenReady();
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(scratchDir, { recursive: true });
  initCom();

  const probe = DesktopWallpaper.create();
  const monitors = probe.monitors();
  const originals = monitors.map((monitor) => (monitor.rect ? probe.getWallpaper(monitor.id) : null));
  probe.release();

  const sources = typeof args.sources === 'string' ? args.sources.split(',') : await defaultSources();
  console.log(`Preparing images from ${sources.join(', ')} …`);
  const images = await Promise.all(sources.slice(0, 2).map((source, index) => prepareImageSet(source, `src${index}`, monitors)));

  const report: ProfileReport = {
    startedAt: new Date().toISOString(),
    os: `${os.version()} (${os.release()})`,
    electron: process.versions.electron ?? 'unknown',
    environment: captureEnvironment(),
    monitors,
    images,
    settleMs,
    applier: null,
    trials: [],
    burst: null,
    bursts: [],
  };

  let client: ApplierClient | null = null;
  if (burstMode || selectedVariants.some((variant) => variant.mode === 'utility')) {
    const childPath = String(args.applier);
    console.log(`Starting the applier child ${childPath} …`);
    const started = await startApplier(childPath);
    client = started.client;
    report.applier = { childPath, capabilities: started.capabilities };
  }

  const control = new SharedArrayBuffer(CONTROL_SLOTS * Int32Array.BYTES_PER_ELEMENT);
  const ctrl = new Int32Array(control);
  const watcherInit: DesktopWatcherInit = {
    control,
    region: desktopRegion(monitors),
    gridWidth: GRID_WIDTH,
    gridHeight: GRID_HEIGHT,
    settleMs,
    // A burst keeps the desktop changing for its whole duration before it can settle.
    timeoutMs: burstMode ? burstDurationMs + TIMEOUT_MS : TIMEOUT_MS,
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
  const probes: Probes = { ctrl, watcher, explorerCpu, dwmCpu };

  try {
    if (burstMode && client) {
      await runBursts(report, images, probes, client);
    } else {
      await runTrials(report, images, probes, client);
    }
  } finally {
    client?.close();

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
  const name = `profile-${stamp}-${burstMode ? 'burst-' : ''}${report.environment.label}`;
  const jsonPath = path.join(outDir, `${name}.json`);
  const mdPath = path.join(outDir, `${name}.md`);
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
