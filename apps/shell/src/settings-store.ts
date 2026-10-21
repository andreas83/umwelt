import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Non-sensitive app settings. The profile lives separately, encrypted. */
export interface Settings {
  /** Part of the page cache key; changes only on "refresh world" (Phase 4). */
  worldSeed: string;
  /** Date in the generated world, fixed at first launch. */
  worldDate: string;
}

export async function loadSettings(path: string): Promise<Settings> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Settings;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const settings: Settings = { worldSeed: 'world-1', worldDate: new Date().toISOString().slice(0, 10) };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(settings, null, 2));
  return settings;
}
