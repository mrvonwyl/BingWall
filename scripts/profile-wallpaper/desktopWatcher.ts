import koffi from 'koffi';
import { parentPort, workerData } from 'node:worker_threads';
import { nowMs, sleepSync } from './clock.js';
import { SLOT_ARM_SEQ, SLOT_STOP, type DesktopWatcherInit, type DesktopWatcherMessage } from './probes.models.js';

// Worker: detects when the desktop visibly changes by point-sampling the composited
// screen (as the user sees it) into a small grid in a tight loop. Each screen read
// waits on the compositor, so it is one StretchBlt per sample, never one per pixel.
// Some grid cells must land on uncovered desktop for detection to work.

const { control, region, gridWidth, gridHeight, settleMs, timeoutMs } = workerData as DesktopWatcherInit;
const gridSize = gridWidth * gridHeight;
const ctrl = new Int32Array(control);

const SRCCOPY = 0x00cc0020;
const BI_RGB = 0;
const DIB_RGB_COLORS = 0;
const COLORONCOLOR = 3;
const CALIBRATION_MS = 600;
// A wallpaper change repaints most cells; fewer than this is a window, cursor or clock.
const CHANGE_THRESHOLD_CELLS = Math.ceil(gridSize * 0.02);

koffi.struct('BITMAPINFOHEADER', {
  biSize: 'uint32_t',
  biWidth: 'int32_t',
  biHeight: 'int32_t',
  biPlanes: 'uint16_t',
  biBitCount: 'uint16_t',
  biCompression: 'uint32_t',
  biSizeImage: 'uint32_t',
  biXPelsPerMeter: 'int32_t',
  biYPelsPerMeter: 'int32_t',
  biClrUsed: 'uint32_t',
  biClrImportant: 'uint32_t',
});
koffi.struct('BITMAPINFO', { bmiHeader: 'BITMAPINFOHEADER', bmiColors: koffi.array('uint32_t', 1) });

const user32 = koffi.load('user32.dll');
const gdi32 = koffi.load('gdi32.dll');

const GetDC = user32.func('void * __stdcall GetDC(void *hwnd)');
const CreateCompatibleDC = gdi32.func('void * __stdcall CreateCompatibleDC(void *hdc)');
const CreateDIBSection = gdi32.func(
  'void * __stdcall CreateDIBSection(void *hdc, const BITMAPINFO *pbmi, uint32_t usage, _Out_ void **bits, void *section, uint32_t offset)',
);
const SelectObject = gdi32.func('void * __stdcall SelectObject(void *hdc, void *obj)');
const StretchBlt = gdi32.func(
  'int __stdcall StretchBlt(void *dst, int x, int y, int cx, int cy, void *src, int x1, int y1, int cx1, int cy1, uint32_t rop)',
);
const SetStretchBltMode = gdi32.func('int __stdcall SetStretchBltMode(void *hdc, int mode)');
const GdiFlush = gdi32.func('int __stdcall GdiFlush()');

const screenDc = GetDC(null);
const memoryDc = CreateCompatibleDC(screenDc);
const bitsOut: unknown[] = [null];
const bitmap = CreateDIBSection(
  screenDc,
  {
    bmiHeader: {
      biSize: koffi.sizeof('BITMAPINFOHEADER'),
      biWidth: gridWidth,
      biHeight: -gridHeight,
      biPlanes: 1,
      biBitCount: 32,
      biCompression: BI_RGB,
      biSizeImage: 0,
      biXPelsPerMeter: 0,
      biYPelsPerMeter: 0,
      biClrUsed: 0,
      biClrImportant: 0,
    },
    bmiColors: [0],
  },
  DIB_RGB_COLORS,
  bitsOut,
  null,
  0,
);
SelectObject(memoryDc, bitmap);
// Point sampling: no averaging, so a cell only changes when its screen pixel does.
SetStretchBltMode(memoryDc, COLORONCOLOR);
const pixelArray = koffi.array('uint32_t', gridSize);

function sample(): number[] {
  StretchBlt(memoryDc, 0, 0, gridWidth, gridHeight, screenDc, region.x, region.y, region.width, region.height, SRCCOPY);
  GdiFlush();
  return Array.from(koffi.decode(bitsOut[0], pixelArray) as ArrayLike<number>);
}

function post(message: DesktopWatcherMessage): void {
  parentPort!.postMessage(message);
}

let seq = 0;
let tracking = false;
let armedAt = 0;
let baseline: number[] = [];
let previous: number[] = [];
// Cells that changed on their own before the apply (clocks, terminal output, video).
let noisy = new Set<number>();
let changed = new Set<number>();
let firstChangeAtMs: number | null = null;
let lastChangeAtMs: number | null = null;
let samples = 0;
let maxSampleMs = 0;
let maxSampleGapMs = 0;
let lastSampleEnd = 0;
let timeline: [number, number, number][] = [];

while (Atomics.load(ctrl, SLOT_STOP) === 0) {
  const armSeq = Atomics.load(ctrl, SLOT_ARM_SEQ);
  if (armSeq !== seq) {
    seq = armSeq;
    noisy = new Set();
    baseline = sample();
    const calibrateUntil = nowMs() + CALIBRATION_MS;
    while (nowMs() < calibrateUntil) {
      const current = sample();
      current.forEach((pixel, i) => pixel !== baseline[i] && noisy.add(i));
      baseline = current;
      sleepSync(1);
    }
    previous = baseline;
    changed = new Set();
    firstChangeAtMs = null;
    lastChangeAtMs = null;
    samples = 0;
    maxSampleMs = 0;
    maxSampleGapMs = 0;
    armedAt = nowMs();
    lastSampleEnd = armedAt;
    timeline = [];
    tracking = true;
    post({ type: 'armed', seq });
  }

  if (tracking) {
    const start = nowMs();
    const current = sample();
    const end = nowMs();
    samples++;
    maxSampleMs = Math.max(maxSampleMs, end - start);
    maxSampleGapMs = Math.max(maxSampleGapMs, end - lastSampleEnd);
    lastSampleEnd = end;

    let differFromBaseline = 0;
    let differFromPrevious = 0;
    for (let i = 0; i < current.length; i++) {
      if (noisy.has(i)) {
        continue;
      }
      if (current[i] !== baseline[i]) {
        changed.add(i);
        differFromBaseline++;
      }
      if (current[i] !== previous[i]) {
        differFromPrevious++;
      }
    }
    previous = current;
    timeline.push([start, differFromBaseline, differFromPrevious]);

    // Timestamp the start of the sample: the change happened at or before it was read.
    if (differFromBaseline >= CHANGE_THRESHOLD_CELLS) {
      firstChangeAtMs ??= start;
    }
    if (firstChangeAtMs !== null && differFromPrevious >= CHANGE_THRESHOLD_CELLS) {
      lastChangeAtMs = start;
    }
    lastChangeAtMs ??= firstChangeAtMs;

    const settled = lastChangeAtMs !== null && end - lastChangeAtMs > settleMs;
    // Hard cap too: on-screen activity elsewhere can keep cells changing indefinitely.
    const timedOut = end - armedAt > timeoutMs;
    if (settled || timedOut) {
      tracking = false;
      post({
        type: 'result',
        seq,
        firstChangeAtMs,
        lastChangeAtMs,
        settled,
        changedPoints: changed.size,
        samples,
        maxSampleMs,
        maxSampleGapMs,
        timeline,
      });
    }
  }

  sleepSync(1);
}
