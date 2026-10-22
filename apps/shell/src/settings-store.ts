import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Non-sensitive app settings. The profile lives separately, encrypted. */
export interface Settings {
  /** Part of the page cache key; changes only on "refresh world" (Phase 4). */
  worldSeed: string;
  /** Date in the generated world, fixed at first launch. */
  worldDate: string;
  /** 'B': rewrite real pages (falls back to C, then A). 'A': everything generated. Missing in old files → 'B'. */
  sourceMode?: 'A' | 'B';
  /** Preset shown in the right pane of compare tabs. Missing → 'progressive'. */
  comparePresetId?: string;
}

export async function saveSettings(path: string, settings: Settings): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(settings, null, 2));
}

/** Invariant 5: the only way cached pages get regenerated. Old pages stay on disk under the previous seed. */
export function refreshedWorld(settings: Settings): Settings {
  return { ...settings, worldSeed: `world-${Date.now().toString(36)}` };
}

export async function loadSettings(path: string): Promise<Settings> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Settings;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
  const settings: Settings = { worldSeed: 'world-1', worldDate: new Date().toISOString().slice(0, 10) };
  await saveSettings(path, settings);
  return settings;
}
