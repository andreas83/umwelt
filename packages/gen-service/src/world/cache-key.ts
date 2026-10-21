import { createHash } from 'node:crypto';
import type { Mode } from '../strategies/types.js';

/**
 * Deterministic page cache key for `(url, profile_id, world_seed, mode)`.
 * The URL is normalized so trivially different spellings hit the same page.
 */
export function pageCacheKey(url: URL, profileId: string, worldSeed: string, mode: Mode): string {
  const u = new URL(url);
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  u.searchParams.sort();
  return createHash('sha256')
    .update(JSON.stringify([u.toString(), profileId, worldSeed, mode]))
    .digest('hex');
}
