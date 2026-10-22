import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRESETS, preset } from './presets.js';
import { parseProfile } from './schema.js';

describe('presets', () => {
  it('are valid and distinct', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    expect(preset('traditional')?.orientation.political).toBe(0.9);
  });

  it.each(PRESETS.map((p) => p.id))('examples/profiles/%s.json mirrors the preset', (id) => {
    const file = new URL(`../../../examples/profiles/${id}.json`, import.meta.url);
    expect(parseProfile(JSON.parse(readFileSync(file, 'utf8')))).toEqual(preset(id));
  });
});
