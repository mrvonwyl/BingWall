import { runApplierChild } from './applierChildRunner.js';

// Entry point of the applier utilityProcess (forked by applierHost in main). koffi is only
// ever loaded here, off Electron's main thread.
runApplierChild({
  parentPort: process.parentPort,
  platform: process.platform,
  loadWin32Backend: async () => {
    const [{ createWin32Backend }, { win32Native }] = await Promise.all([
      import('./backends/win32.js'),
      import('./backends/win32Native.js'),
    ]);
    return createWin32Backend(win32Native);
  },
}).catch((error: unknown) => {
  console.error('BingWall applier: failed to start', error);
  process.exit(1);
});
