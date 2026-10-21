import koffi from 'koffi';
import { workerData } from 'node:worker_threads';
import { nowMs, sleepSync } from './clock.js';
import { SLOT_ARM_SEQ, SLOT_MAX_PING_US, SLOT_PING_COUNT, SLOT_STOP } from './probes.models.js';

// Worker: measures how responsive Explorer's desktop window thread is by
// round-tripping WM_NULL to Progman. A long round-trip means the shell is hung.

const ctrl = new Int32Array(workerData.control as SharedArrayBuffer);

const WM_NULL = 0x0000;
const SMTO_NORMAL = 0x0000;
const PING_TIMEOUT_MS = 10_000;
const PING_INTERVAL_MS = 10;

const user32 = koffi.load('user32.dll');
const FindWindowW = user32.func('void * __stdcall FindWindowW(const char16_t *cls, const char16_t *name)');
const SendMessageTimeoutW = user32.func(
  'intptr_t __stdcall SendMessageTimeoutW(void *hwnd, uint32_t msg, uintptr_t wParam, intptr_t lParam, uint32_t flags, uint32_t timeout, _Out_ uintptr_t *result)',
);

const progman = FindWindowW('Progman', null);
if (!progman) {
  throw new Error('Progman window not found');
}

let seq = 0;
while (Atomics.load(ctrl, SLOT_STOP) === 0) {
  const armSeq = Atomics.load(ctrl, SLOT_ARM_SEQ);
  if (armSeq !== seq) {
    seq = armSeq;
    Atomics.store(ctrl, SLOT_MAX_PING_US, 0);
    Atomics.store(ctrl, SLOT_PING_COUNT, 0);
  }

  const start = nowMs();
  SendMessageTimeoutW(progman, WM_NULL, 0, 0, SMTO_NORMAL, PING_TIMEOUT_MS, [0]);
  const elapsedUs = Math.round((nowMs() - start) * 1000);

  if (elapsedUs > Atomics.load(ctrl, SLOT_MAX_PING_US)) {
    Atomics.store(ctrl, SLOT_MAX_PING_US, elapsedUs);
  }
  Atomics.add(ctrl, SLOT_PING_COUNT, 1);

  sleepSync(PING_INTERVAL_MS);
}
