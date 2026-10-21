import type { SiteSkeleton } from './schema.js';

const FONT_STACKS: Record<SiteSkeleton['fonts']['body'], string> = {
  sans: 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", "Noto Serif", serif',
  slab: 'Rockwell, "Roboto Slab", "Courier New", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  rounded: 'ui-rounded, "Nunito", "Varela Round", system-ui, sans-serif',
  condensed: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", sans-serif',
};
const RADIUS = { none: '0', small: '6px', large: '14px' } as const;
const SPACING = { compact: '0.75', regular: '1', airy: '1.3' } as const;

type Rgb = [number, number, number];

/** Only `#rrggbb` / `#rgb`; anything else (names, url(), expressions) is rejected. */
export function parseHex(s: string): Rgb | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim());
  if (!m) return null;
  const hex = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const toHex = (c: Rgb) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const BLACK: Rgb = [17, 17, 17];
const WHITE: Rgb = [255, 255, 255];

/** Keeps `fg` if it reads on `bg` at `min` contrast, otherwise falls back to near-black or white. */
function readable(fg: Rgb | null, bg: Rgb, min: number): Rgb {
  if (fg && contrast(fg, bg) >= min) return fg;
  return contrast(BLACK, bg) >= contrast(WHITE, bg) ? BLACK : WHITE;
}

/** Sanitized palette: valid hex only, text readable on background/surface, accent text readable on accent. */
export function safePalette(p: SiteSkeleton['palette']): Record<keyof SiteSkeleton['palette'], string> {
  const bg = parseHex(p.background) ?? WHITE;
  const surface = parseHex(p.surface) ?? bg;
  const accent = parseHex(p.accent) ?? [10, 102, 216];
  const text = readable(parseHex(p.text), bg, 7);
  return {
    background: toHex(bg),
    surface: toHex(surface),
    text: toHex(contrast(text, surface) >= 4.5 ? text : readable(null, surface, 4.5)),
    muted: toHex(readable(parseHex(p.muted), bg, 4.5)),
    accent: toHex(readable(accent, bg, 3)),
    accentText: toHex(readable(parseHex(p.accentText), accent, 4.5)),
    border: toHex(parseHex(p.border) ?? surface),
  };
}

/** CSS custom properties for a skeleton; all values come from allowlists or sanitized colors. */
export function skeletonCss(s: SiteSkeleton): string {
  const c = safePalette(s.palette);
  return `:root{--bg:${c.background};--surface:${c.surface};--text:${c.text};--muted:${c.muted};--accent:${c.accent};--accent-text:${c.accentText};--border:${c.border};--font-body:${FONT_STACKS[s.fonts.body]};--font-heading:${FONT_STACKS[s.fonts.heading]};--radius:${RADIUS[s.radius]};--space:${SPACING[s.density]}}`;
}
