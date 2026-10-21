import { describe, expect, it } from 'vitest';
import { describeAxis, describeProfile } from './describe.js';
import { parseProfile } from './schema.js';

describe('describeProfile', () => {
  it('describes axis direction and intensity', () => {
    expect(describeAxis('political', -0.9)).toBe('political: strongly left / progressive');
    expect(describeAxis('religious', 0.5)).toBe('religious: moderately religious / devout');
    expect(describeAxis('sexual', 0)).toBe('sexual: balanced, no lean');
    expect(describeAxis('sexual', null)).toBeNull();
  });

  it('is deterministic', () => {
    const p = parseProfile({ id: 'p', name: 'n', interests: ['cycling'], orientation: { political: 0.9 } });
    expect(describeProfile(p)).toBe(describeProfile(p));
    expect(describeProfile(p)).toContain('Interests: cycling');
  });
});
