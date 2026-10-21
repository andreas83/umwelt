import { z } from 'zod';

export const LAYOUTS = ['news', 'magazine', 'forum', 'shop', 'blog', 'wiki', 'search', 'portal'] as const;
export const FONTS = ['sans', 'serif', 'slab', 'mono', 'rounded', 'condensed'] as const;

const NavLink = z.object({ text: z.string().min(1), href: z.string().min(1) });

/**
 * A site's identity, generated once per domain. Design tokens only — the renderer turns them into CSS and markup,
 * so the model never writes either (invariant 6). Colors are sanitized and contrast-checked at render time.
 */
export const SiteSkeletonSchema = z.object({
  siteName: z.string().min(1),
  tagline: z.string().nullish(),
  layout: z.enum(LAYOUTS),
  palette: z.object({
    background: z.string(),
    surface: z.string(),
    text: z.string(),
    muted: z.string(),
    accent: z.string(),
    accentText: z.string(),
    border: z.string(),
  }),
  fonts: z.object({ heading: z.enum(FONTS), body: z.enum(FONTS) }),
  radius: z.enum(['none', 'small', 'large']),
  density: z.enum(['compact', 'regular', 'airy']),
  headerStyle: z.enum(['bar', 'masthead', 'minimal']),
  nav: z.array(NavLink),
  footer: z.object({ text: z.string(), links: z.array(NavLink) }),
});

export type SiteSkeleton = z.infer<typeof SiteSkeletonSchema>;

/** Used until a domain's skeleton exists, and when skeleton generation fails. */
export function defaultSkeleton(host: string): SiteSkeleton {
  return {
    siteName: host.replace(/^www\./, ''),
    layout: 'portal',
    palette: {
      background: '#ffffff',
      surface: '#f6f6f7',
      text: '#1d1d1f',
      muted: '#6e6e73',
      accent: '#0a66d8',
      accentText: '#ffffff',
      border: '#e3e3e6',
    },
    fonts: { heading: 'sans', body: 'sans' },
    radius: 'small',
    density: 'regular',
    headerStyle: 'bar',
    nav: [],
    footer: { text: '', links: [] },
  };
}

/** Plain-text summary for the content prompt's stable prefix. */
export function describeSkeleton(s: SiteSkeleton): string {
  return [
    `Site name: ${s.siteName}${s.tagline ? ` — ${s.tagline}` : ''}`,
    `Kind of site: ${s.layout}`,
    `Sections: ${s.nav.map((n) => n.text).join(', ') || 'none yet'}`,
  ].join('\n');
}
