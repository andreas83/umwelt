import { describe, expect, it } from 'vitest';
import { contrast, parseHex, safePalette, skeletonCss } from './theme.js';
import { defaultSkeleton } from './schema.js';

describe('theme', () => {
  it('only accepts hex colors', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('#0a66d8')).toEqual([10, 102, 216]);
    expect(parseHex('red')).toBeNull();
    expect(parseHex('url(https://x.test/a.png)')).toBeNull();
    expect(parseHex('#fff;background:url(x)')).toBeNull();
  });

  it('repairs unreadable palettes', () => {
    const p = safePalette({ ...defaultSkeleton('x').palette, background: '#ffffff', text: '#eeeeee', accentText: '#0a66d8' });
    expect(contrast(parseHex(p.text)!, parseHex(p.background)!)).toBeGreaterThanOrEqual(7);
    expect(contrast(parseHex(p.accentText)!, parseHex(p.accent)!)).toBeGreaterThanOrEqual(4.5);
  });

  it('never lets model strings into CSS', () => {
    const css = skeletonCss({ ...defaultSkeleton('x'), palette: { ...defaultSkeleton('x').palette, accent: '}body{display:none' } });
    expect(css).not.toContain('display:none');
  });
});
