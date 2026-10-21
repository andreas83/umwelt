import { createHash } from 'node:crypto';
import type { Mode } from '../strategies/types.js';

/** Canonical form of a URL so trivially different spellings map to the same page. */
export function normalizeUrl(url: URL | string): string {
  const u = new URL(url);
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  u.searchParams.sort();
  return u.toString();
}

/** Deterministic page cache key for `(url, profile_id, world_seed, mode)`. */
export function pageCacheKey(url: URL, profileId: string, worldSeed: string, mode: Mode): string {
  return createHash('sha256')
    .update(JSON.stringify([normalizeUrl(url), profileId, worldSeed, mode]))
    .digest('hex');
}
