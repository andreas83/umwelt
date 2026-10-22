import type { SiteSkeleton } from '../skeleton/schema.js';
import type { StyleProbe } from './types.js';

/** `rgb(1, 2, 3)` / `rgba(1, 2, 3, 0.5)` → `#010203`; transparent or unparsable → null. */
export function cssColorToHex(c: string | null | undefined): string | null {
  const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/.exec(c?.trim() ?? '');
  if (!m) return null;
  if (m[4] !== undefined && Number(m[4]) < 0.5) return null;
  return `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
}

function fontKind(family: string | null | undefined): SiteSkeleton['fonts']['body'] {
  const f = (family ?? '').toLowerCase();
  if (/mono|courier|consolas|menlo/.test(f)) return 'mono';
  if (/slab|rockwell|arvo|zilla/.test(f)) return 'slab';
  if (/condensed|narrow|oswald|bebas/.test(f)) return 'condensed';
  if (/rounded|nunito|varela|quicksand/.test(f)) return 'rounded';
  // "serif" alone, or a serif face named first, but not "sans-serif".
  if (/(^|[\s,"'])serif|georgia|times|merriweather|playfair|garamond|tiempos|charter|lora/.test(f.replace(/sans-serif/g, ''))) return 'serif';
  return 'sans';
}

/**
 * Mode C: the real site's colors, fonts, name and navigation laid over a generated skeleton, so a page we cannot
 * rewrite still looks like the site. Layout, density and footer stay as generated.
 */
export function applyProbe(s: SiteSkeleton, probe: StyleProbe): SiteSkeleton {
  const bg = cssColorToHex(probe.background) ?? s.palette.background;
  const header = cssColorToHex(probe.headerBackground);
  return {
    ...s,
    siteName: probe.siteName.trim() || s.siteName,
    palette: {
      ...s.palette,
      background: bg,
      surface: header ?? s.palette.surface,
      text: cssColorToHex(probe.text) ?? s.palette.text,
      accent: cssColorToHex(probe.link) ?? s.palette.accent,
    },
    fonts: { body: fontKind(probe.fontBody), heading: fontKind(probe.fontHeading ?? probe.fontBody) },
    headerStyle: header && header !== bg ? 'bar' : s.headerStyle,
    nav: probe.nav.length >= 3 ? probe.nav.slice(0, 8) : s.nav,
  };
}
