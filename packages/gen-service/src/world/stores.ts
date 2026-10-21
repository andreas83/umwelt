import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { PageContent } from '../generator/schema.js';
import type { SiteSkeleton } from '../skeleton/schema.js';

interface Provenance {
  model: string;
  promptVersion: string;
  createdAt: string;
}

export interface CachedPage extends Provenance {
  url: string;
  content: PageContent;
}

export interface CachedSkeleton extends Provenance {
  host: string;
  skeleton: SiteSkeleton;
}

export interface JsonStore<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T): Promise<void>;
}

export type PageStore = JsonStore<CachedPage>;
export type SkeletonStore = JsonStore<CachedSkeleton>;

/** Description of where a link leads, recorded when the linking page was generated. */
export interface LinkStore {
  get(url: string): string | undefined;
  add(entries: Array<{ url: string; description: string }>): Promise<void>;
}

async function writeAtomic(path: string, data: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, path);
}

/** One JSON file per key. Pages cache content, not HTML, so renderer changes apply to cached pages. */
export class FileJsonStore<T> implements JsonStore<T> {
  constructor(private readonly dir: string) {}

  async get(key: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(join(this.dir, `${key}.json`), 'utf8')) as T;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw e;
    }
  }

  async set(key: string, value: T): Promise<void> {
    await writeAtomic(join(this.dir, `${key}.json`), JSON.stringify(value));
  }
}

/** Single JSON map, loaded once. The first description recorded for a URL wins. */
export class FileLinkStore implements LinkStore {
  private constructor(
    private readonly path: string,
    private readonly links: Map<string, string>,
  ) {}

  static async open(path: string): Promise<FileLinkStore> {
    let entries: Record<string, string> = {};
    try {
      entries = JSON.parse(await readFile(path, 'utf8')) as Record<string, string>;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    return new FileLinkStore(path, new Map(Object.entries(entries)));
  }

  get(url: string): string | undefined {
    return this.links.get(url);
  }

  async add(entries: Array<{ url: string; description: string }>): Promise<void> {
    let changed = false;
    for (const { url, description } of entries) {
      if (!this.links.has(url)) {
        this.links.set(url, description);
        changed = true;
      }
    }
    if (changed) await writeAtomic(this.path, JSON.stringify(Object.fromEntries(this.links)));
  }
}
