import { createHash } from 'node:crypto';
import type { Profile } from './schema.js';

/**
 * Cache identity of a profile: its id plus a hash of its contents, so editing a profile yields fresh pages
 * while unchanged profiles keep hitting the cache. Schema-parsed profiles have stable key order.
 */
export function profileCacheId(p: Profile): string {
  return `${p.id}-${createHash('sha256').update(JSON.stringify(p)).digest('hex').slice(0, 12)}`;
}
