// process.hrtime is process-wide, so worker and main-thread timestamps are comparable.
export function nowMs(): number {
  return Number(process.hrtime.bigint()) / 1e6;
}

const sleepCell = new Int32Array(new SharedArrayBuffer(4));

// Synchronous sleep for worker threads that spin in a tight loop.
export function sleepSync(ms: number): void {
  Atomics.wait(sleepCell, 0, 0, ms);
}
