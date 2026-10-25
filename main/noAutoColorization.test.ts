import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const thisFile = fileURLToPath(import.meta.url);

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(c?ts|html)$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => path.resolve(file) !== path.resolve(thisFile));
}

describe('AutoColorization', () => {
  it('is never read or written by the app (main, preload or renderer)', async () => {
    const files = (
      await Promise.all(['main', 'preload', 'renderer'].map((dir) => listSourceFiles(path.join(projectRoot, dir))))
    ).flat();

    const offenders: string[] = [];
    for (const file of files) {
      const source = await fs.readFile(file, 'utf8');
      if (/AutoColorization/i.test(source)) {
        offenders.push(path.relative(projectRoot, file));
      }
    }

    expect(files.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
