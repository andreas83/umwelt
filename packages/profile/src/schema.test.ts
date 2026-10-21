import { describe, expect, it } from 'vitest';
import { parseProfile } from './schema.js';

describe('ProfileSchema', () => {
  it('fills defaults', () => {
    const p = parseProfile({ id: 'p1', name: 'Neutral' });
    expect(p.strength).toBe(1);
    expect(p.orientation).toEqual({ political: null, religious: null, sexual: null });
  });

  it('rejects out-of-range axes', () => {
    expect(() => parseProfile({ id: 'p1', name: 'x', orientation: { political: 2 } })).toThrow();
  });
});
