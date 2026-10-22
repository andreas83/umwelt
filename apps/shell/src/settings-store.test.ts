import { describe, expect, it } from 'vitest';
import { refreshedWorld } from './settings-store.js';

describe('refreshedWorld', () => {
  it('changes only the seed', () => {
    const s = { worldSeed: 'world-1', worldDate: '2026-10-21' };
    const r = refreshedWorld(s);
    expect(r.worldSeed).not.toBe(s.worldSeed);
    expect(r.worldDate).toBe(s.worldDate);
  });
});
