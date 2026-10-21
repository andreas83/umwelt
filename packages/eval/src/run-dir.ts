import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunMeta } from './records.js';
import { runsDir } from './paths.js';

export interface RunDir {
  dir: string;
  meta: RunMeta;
  results: string;
  judgments: string;
}

const files = (dir: string) => ({ results: join(dir, 'results.jsonl'), judgments: join(dir, 'judgments.jsonl') });

export async function openRun(runId: string): Promise<RunDir> {
  const dir = join(runsDir, runId);
  const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')) as RunMeta;
  return { dir, meta, ...files(dir) };
}

export async function createRun(contentPrompt: string): Promise<RunDir> {
  const now = new Date();
  const runId = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = join(runsDir, runId);
  await mkdir(dir, { recursive: true });
  const meta: RunMeta = { runId, createdAt: now.toISOString(), worldDate: now.toISOString().slice(0, 10), contentPrompt };
  await writeFile(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  return { dir, meta, ...files(dir) };
}
