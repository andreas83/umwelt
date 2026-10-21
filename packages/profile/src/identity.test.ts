import { describe, expect, it } from 'vitest';
import { profileCacheId } from './identity.js';
import { parseProfile } from './schema.js';

describe('profileCacheId', () => {
  it('is stable and changes with content', () => {
    const a = parseProfile({ id: 'p', name: 'A', tone: 'dry' });
    expect(profileCacheId(a)).toBe(profileCacheId(parseProfile({ tone: 'dry', name: 'A', id: 'p' })));
    expect(profileCacheId(a)).not.toBe(profileCacheId({ ...a, tone: 'warm' }));
  });
});
