import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FetchedResource, ResourceFetcher } from './types.js';

/** Reserved host for copies of real-site assets (fonts, logos, CSS images). `.invalid` never resolves. */
export const ASSET_HOST = 'asset.umwelt.invalid';

export interface AssetStore {
  put(res: FetchedResource): Promise<string>;
  get(id: string): Promise<FetchedResource | undefined>;
}

/** Content-addressed files: `<id>` holds the bytes, `<id>.type` the content type. */
export class FileAssetStore implements AssetStore {
  constructor(private readonly dir: string) {}

  async put(res: FetchedResource): Promise<string> {
    const id = createHash('sha256').update(res.bytes).digest('hex').slice(0, 32);
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, id), res.bytes);
    await writeFile(join(this.dir, `${id}.type`), res.contentType);
    return id;
  }

  async get(id: string): Promise<FetchedResource | undefined> {
    if (!/^[0-9a-f]{32}$/.test(id)) return undefined;
    try {
      const [bytes, contentType] = await Promise.all([readFile(join(this.dir, id)), readFile(join(this.dir, `${id}.type`), 'utf8')]);
      return { bytes, contentType };
    } catch {
      return undefined;
    }
  }
}

const MAX_BYTES: Array<[RegExp, number]> = [
  [/^font\/|woff|truetype|opentype/, 2_000_000],
  [/^image\//, 400_000],
];

/** Copies one real-site resource into the asset store; null if it is the wrong kind, too large or unreachable. */
export async function copyAsset(url: string, fetcher: ResourceFetcher, store: AssetStore, kinds: RegExp): Promise<string | null> {
  const res = await fetcher.fetch(url);
  if (!res || !kinds.test(res.contentType)) return null;
  const max = MAX_BYTES.find(([re]) => re.test(res.contentType))?.[1] ?? 0;
  if (res.bytes.byteLength > max) return null;
  return `https://${ASSET_HOST}/${await store.put(res)}`;
}

const FONT_OR_IMAGE = /^(font\/|image\/)|woff|truetype|opentype|octet-stream/;

/**
 * Rewrites every `url(...)` in a stylesheet: fonts and small images become local asset URLs, everything else
 * `none`. `@import` is dropped (imported sheets are listed separately by the snapshot). Nothing in the result
 * can reach the network.
 */
export async function localizeCss(css: string, baseUrl: string, fetcher: ResourceFetcher, store: AssetStore): Promise<string> {
  const urls = new Map<string, string>();
  const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  for (const m of css.matchAll(re)) {
    const raw = m[2]!.trim();
    if (urls.has(raw) || raw.startsWith('data:') || raw.startsWith('#')) continue;
    let abs: string;
    try {
      abs = new URL(raw, baseUrl).toString();
    } catch {
      urls.set(raw, '');
      continue;
    }
    urls.set(raw, abs.startsWith('http') ? ((await copyAsset(abs, fetcher, store, FONT_OR_IMAGE)) ?? '') : '');
  }
  return css
    .replace(/@import\s+[^;]+;/gi, '')
    .replace(/\/\*#\s*sourceMappingURL=[^*]*\*\//g, '')
    .replace(re, (whole, _q, raw: string) => {
      const t = raw.trim();
      if (t.startsWith('#')) return whole;
      if (t.startsWith('data:')) return /^data:(image|font|application\/font)/i.test(t) ? whole : 'none';
      const local = urls.get(t);
      return local ? `url("${local}")` : 'none';
    });
}
