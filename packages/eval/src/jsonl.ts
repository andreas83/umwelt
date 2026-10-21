import { appendFile, readFile } from 'node:fs/promises';

export async function readJsonl<T>(path: string): Promise<T[]> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l) as T);
}

/** One line per write so concurrent workers never interleave a record. */
export async function appendJsonl(path: string, record: unknown): Promise<void> {
  await appendFile(path, JSON.stringify(record) + '\n');
}
