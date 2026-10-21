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

const hash = (parts: unknown[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');

/** Deterministic page cache key for `(url, profile_id, world_seed, mode)`. */
export function pageCacheKey(url: URL, profileId: string, worldSeed: string, mode: Mode): string {
  return hash([normalizeUrl(url), profileId, worldSeed, mode]);
}

/** One skeleton per domain, per profile and world. */
export function skeletonCacheKey(url: URL, profileId: string, worldSeed: string): string {
  return hash(['skeleton', url.hostname.toLowerCase(), profileId, worldSeed]);
}
