import { spawnSync } from 'node:child_process';
import koffi from 'koffi';

// Cumulative CPU time (kernel + user) of named processes, read with GetProcessTimes.

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

const kernel32 = koffi.load('kernel32.dll');
const OpenProcess = kernel32.func('void * __stdcall OpenProcess(uint32_t access, int inherit, uint32_t pid)');
const CloseHandle = kernel32.func('int __stdcall CloseHandle(void *handle)');
const GetProcessTimes = kernel32.func(
  'int __stdcall GetProcessTimes(void *process, _Out_ uint64_t *creation, _Out_ uint64_t *exit, _Out_ uint64_t *kernel, _Out_ uint64_t *user)',
);

function pidsOf(imageName: string): number[] {
  const { stdout } = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${imageName}`, '/FO', 'CSV', '/NH'], { encoding: 'utf-8' });
  return stdout
    .split(/\r?\n/)
    .map((line) => line.split('","'))
    .filter((cells) => cells.length > 1)
    .map((cells) => Number(cells[1].replace(/"/g, '')));
}

export class ProcessCpuMeter {
  private readonly handles: unknown[];

  constructor(readonly imageName: string) {
    this.handles = pidsOf(imageName)
      .map((pid) => OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid))
      .filter((handle) => handle);
  }

  get available(): boolean {
    return this.handles.length > 0;
  }

  // Total CPU time across all instances, in ms.
  cpuMs(): number {
    let total = 0;
    for (const handle of this.handles) {
      const kernel: unknown[] = [0];
      const user: unknown[] = [0];
      if (GetProcessTimes(handle, [0], [0], kernel, user)) {
        total += (Number(kernel[0]) + Number(user[0])) / 10_000;
      }
    }
    return total;
  }

  close(): void {
    for (const handle of this.handles) {
      CloseHandle(handle);
    }
  }
}
