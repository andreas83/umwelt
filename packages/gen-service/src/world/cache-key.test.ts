import { describe, expect, it } from 'vitest';
import { pageCacheKey } from './cache-key.js';

describe('pageCacheKey', () => {
  const k = (url: string, seed = 's1') => pageCacheKey(new URL(url), 'p1', seed, 'A');

  it('is stable across hash, host case and query order', () => {
    expect(k('https://Example.com/a?b=2&a=1#top')).toBe(k('https://example.com/a?a=1&b=2'));
  });

  it('changes with the world seed', () => {
    expect(k('https://example.com/', 's1')).not.toBe(k('https://example.com/', 's2'));
  });
});
