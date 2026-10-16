import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

// Dev supervisor: runs the tsc watchers and owns exactly one Electron child.
// The app never relaunches itself — this process kills the old instance and waits
// for it to exit before starting a new one, so instances cannot pile up.

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tscBin = path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const electronDir = path.join(projectRoot, 'node_modules', 'electron');
const electronExe = path.join(electronDir, 'dist', fs.readFileSync(path.join(electronDir, 'path.txt'), 'utf-8').trim());
const restartTriggerDirs = [path.join(projectRoot, 'dist', 'main'), path.join(projectRoot, 'dist', 'preload')];

const COMPILE_DONE = /Found (\d+) errors?\. Watching for file changes\./;
const EMITTED_FILE = /^TSFILE: (.+)$/;

const watchers = [
  { name: 'MAIN', project: 'tsconfig.json', process: null as ChildProcess | null, ready: false },
  { name: 'PRELOAD', project: 'tsconfig.preload.json', process: null as ChildProcess | null, ready: false },
];

let electron: ChildProcess | null = null;
let restartPending = false;
let shuttingDown = false;

function log(message: string): void {
  console.log(`[dev] ${message}`);
}

function killTree(child: ChildProcess): void {
  if (child.pid !== undefined && child.exitCode === null) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  }
}

function startElectron(): void {
  restartPending = false;
  const env: NodeJS.ProcessEnv = { ...process.env, BINGWALL_DEV_RELOAD: '1' };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(electronExe, ['.'], { cwd: projectRoot, stdio: 'inherit', env });
  electron = child;
  log(`Electron started (pid ${child.pid})`);

  child.on('exit', (code) => {
    electron = null;
    if (shuttingDown) {
      return;
    }
    if (restartPending) {
      startElectron();
      return;
    }
    if (code === 0) {
      log('Electron quit — stopping dev session.');
      shutdown();
      return;
    }
    log(`Electron exited with code ${code} — waiting for the next successful compile to start it again.`);
  });
}

function restartElectron(): void {
  if (shuttingDown) {
    return;
  }
  if (electron === null) {
    startElectron();
    return;
  }
  if (!restartPending) {
    restartPending = true;
    log('Main/preload changed — restarting Electron...');
    killTree(electron);
  }
}

function startWatcher(watcher: (typeof watchers)[number]): void {
  const child = spawn(
    process.execPath,
    [tscBin, '-p', watcher.project, '--watch', '--preserveWatchOutput', '--listEmittedFiles'],
    { cwd: projectRoot, stdio: ['ignore', 'pipe', 'inherit'] },
  );
  watcher.process = child;

  let emittedRestartTrigger = false;
  readline.createInterface({ input: child.stdout! }).on('line', (line) => {
    const emitted = EMITTED_FILE.exec(line);
    if (emitted) {
      const file = path.resolve(emitted[1]);
      if (restartTriggerDirs.some((dir) => file.startsWith(dir + path.sep))) {
        emittedRestartTrigger = true;
      }
      return;
    }

    if (line.trim() !== '') {
      console.log(`[${watcher.name}] ${line}`);
    }

    const done = COMPILE_DONE.exec(line);
    if (!done) {
      return;
    }
    const triggered = emittedRestartTrigger;
    emittedRestartTrigger = false;
    if (done[1] !== '0') {
      return;
    }

    const wasReady = watchers.every((w) => w.ready);
    watcher.ready = true;
    if (!watchers.every((w) => w.ready)) {
      return;
    }
    if (!wasReady || triggered) {
      restartElectron();
    }
  });

  child.on('exit', (code) => {
    if (!shuttingDown) {
      log(`${watcher.name} watcher exited with code ${code} — stopping dev session.`);
      shutdown();
    }
  });
}

function shutdown(): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  if (electron) {
    killTree(electron);
  }
  for (const watcher of watchers) {
    if (watcher.process) {
      killTree(watcher.process);
    }
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);

for (const watcher of watchers) {
  startWatcher(watcher);
}
