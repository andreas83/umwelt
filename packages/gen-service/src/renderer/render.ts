import { pageKindOf, type ContentBlock, type ImageSpec, type PageContent } from '../generator/schema.js';
import { defaultSkeleton, type SiteSkeleton } from '../skeleton/schema.js';
import { skeletonCss } from '../skeleton/theme.js';
import { esc } from './escape.js';

type Link = PageContent['links'][number];

export interface RenderOptions {
  /** Maps a generated href to the one used in the page. Default: unchanged. */
  linkHref?: (href: string) => string;
  /** Invariant 4: on by default. */
  showGeneratedIndicator?: boolean;
  /** URL for an image spec; null or absent renders a captioned box instead. */
  imageSrc?: (image: ImageSpec) => string | null;
}

/** Layout-independent base; every value comes from the skeleton's CSS variables. */
export const BASE_CSS = `
:root{--bg:#fff;--surface:#f6f6f7;--text:#1d1d1f;--muted:#6e6e73;--accent:#0a66d8;--accent-text:#fff;--border:#e3e3e6;--font-body:system-ui,sans-serif;--font-heading:system-ui,sans-serif;--radius:6px;--space:1}
*{box-sizing:border-box}
body{margin:0;font:16px/1.6 var(--font-body);color:var(--text);background:var(--bg)}
a{color:var(--accent)}
.wrap{max-width:980px;margin:0 auto;padding:0 20px}
.site-header{background:var(--surface);border-bottom:1px solid var(--border)}
.site-header .wrap{display:flex;align-items:center;gap:20px;padding-top:calc(14px*var(--space));padding-bottom:calc(14px*var(--space));flex-wrap:wrap}
.brand{font:700 1.35rem/1.2 var(--font-heading);color:var(--text);text-decoration:none}
.tagline{color:var(--muted);font-size:.9rem}
.site-nav{display:flex;gap:16px;flex-wrap:wrap;margin-left:auto}
.site-nav a{color:var(--text);text-decoration:none;font-size:.95rem}
.site-nav a:hover{color:var(--accent)}
.h-masthead .wrap{flex-direction:column;text-align:center;gap:6px}
.h-masthead .brand{font-size:2.4rem;letter-spacing:-.01em}
.h-masthead .site-nav{margin:6px auto 0;border-top:1px solid var(--border);padding-top:8px}
.h-minimal{background:var(--bg)}
.h-inverted{background:var(--accent);border-bottom:0}.h-inverted .brand,.h-inverted .site-nav a,.h-inverted .tagline{color:var(--accent-text)}
main.wrap{padding-top:calc(28px*var(--space));padding-bottom:calc(40px*var(--space));max-width:760px}
h1,h2,h3{font-family:var(--font-heading);line-height:1.2}
h1{font-size:2rem;margin:0 0 .4em}h2{font-size:1.35rem;margin:1.6em 0 .5em}
p{margin:0 0 calc(1em*var(--space))}
.lede{color:var(--muted);font-size:1.15rem}
blockquote{border-left:3px solid var(--accent);margin:1.2em 0;padding:.2em 0 .2em 1em;font-style:italic}
.meta{color:var(--muted);font-size:.85rem;font-style:normal}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:calc(12px*var(--space)) 16px;margin:calc(10px*var(--space)) 0}
.card p:last-child{margin-bottom:0}
.price{font-weight:700;color:var(--accent)}
.result a{font-size:1.1rem;text-decoration:none}.result .url{color:var(--muted);font-size:.82rem}
.img{background:var(--surface);border:1px solid var(--border);color:var(--muted);padding:48px 16px;text-align:center;border-radius:var(--radius);font-size:.85rem;margin:1em 0}
.related{border-top:1px solid var(--border);margin-top:2em;padding-top:1em}
.related ul{padding-left:1.2em}.related li{margin:.3em 0}
.site-footer{background:var(--surface);border-top:1px solid var(--border);color:var(--muted);font-size:.88rem}
.site-footer .wrap{padding-top:20px;padding-bottom:28px;display:flex;gap:16px;flex-wrap:wrap;align-items:center}
.site-footer a{color:var(--muted)}
.generated{position:fixed;right:10px;bottom:10px;background:#111;color:#fff;font:600 12px system-ui;padding:4px 8px;border-radius:4px;opacity:.85;z-index:9}
.notice{max-width:560px;margin:15vh auto;padding:16px;text-align:center;color:var(--muted)}
figure{margin:1.2em 0}figure img,.thumb img{display:block;width:100%;height:auto;border-radius:var(--radius);background:var(--surface)}
figcaption{color:var(--muted);font-size:.85rem;margin-top:.4em}
.lead-figure{margin-top:0}
.teaser{display:block;color:inherit;text-decoration:none}
.teaser h3{margin:.35em 0 .25em;font-size:1.15rem}.teaser:hover h3{color:var(--accent)}
.teaser p{color:var(--muted);font-size:.95rem;margin:0}
.kicker{color:var(--accent);font:700 .75rem/1 var(--font-body);text-transform:uppercase;letter-spacing:.06em}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:calc(22px*var(--space)) 20px}
.grid .hero{grid-column:1/-1;display:grid;grid-template-columns:3fr 2fr;gap:20px;align-items:center}
.grid .hero h3{font-size:1.9rem}.grid .hero p{font-size:1.05rem}
.avatar{flex:none;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;color:#fff;font:700 .95rem/1 system-ui}
.social-post .head{display:flex;gap:10px;align-items:center;margin-bottom:8px}
.social-post .who{display:flex;flex-direction:column;line-height:1.25}.social-post .who .meta{font-size:.8rem}
.social-post figure{margin:10px -16px}.social-post figure img{border-radius:0}
.actions{display:flex;gap:18px;color:var(--muted);font-size:.85rem;border-top:1px solid var(--border);padding-top:8px;margin-top:8px}
.replies{margin-top:8px;border-top:1px solid var(--border);padding-top:6px}
.reply{font-size:.9rem;margin:4px 0}.reply b{margin-right:6px}
.product .thumb{margin:-12px -16px 10px}.product .thumb img{border-radius:var(--radius) var(--radius) 0 0;aspect-ratio:1;object-fit:cover}
.rating{color:var(--muted);font-size:.85rem}
.k-front main.wrap,.k-listing main.wrap{max-width:1080px}
.k-front h1,.k-listing h1{font-size:1.5rem}
.k-feed main.wrap,.k-thread main.wrap,.k-profile main.wrap{max-width:1000px;display:grid;grid-template-columns:minmax(0,1fr) 280px;column-gap:28px;align-items:start}
.k-feed main.wrap>*,.k-thread main.wrap>*,.k-profile main.wrap>*{grid-column:1}
.k-feed main.wrap>.related,.k-thread main.wrap>.related,.k-profile main.wrap>.related{grid-column:2;grid-row:1/span 50;position:sticky;top:12px;margin:0;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);padding:12px 16px}
.related h2{font-size:1rem;margin:0 0 .5em}
.profile-head{display:flex;gap:16px;align-items:center}.profile-head .avatar{width:84px;height:84px;font-size:2rem}
@media (max-width:760px){.grid .hero{grid-template-columns:1fr}.k-feed main.wrap,.k-thread main.wrap,.k-profile main.wrap{display:block}}
`;

/** Small per-layout adjustments so a forum doesn't look like a newspaper. */
const LAYOUT_CSS: Record<SiteSkeleton['layout'], string> = {
  news: '.l-news h1{font-size:2.4rem}.l-news main.wrap{max-width:720px}.l-news .lede{font-size:1.25rem}',
  magazine: '.l-magazine h1{font-size:2.8rem;letter-spacing:-.02em}.l-magazine main.wrap{max-width:700px}.l-magazine p{font-size:1.08rem}',
  forum: '.l-forum main.wrap{max-width:900px}.l-forum h1{font-size:1.5rem}.l-forum .post{border-left:4px solid var(--accent)}',
  shop: '.l-shop main.wrap{max-width:1000px}.l-shop section{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}.l-shop section>h2{grid-column:1/-1}.l-shop .product{margin:0}',
  blog: '.l-blog main.wrap{max-width:680px}.l-blog p{font-size:1.08rem;line-height:1.75}',
  wiki: '.l-wiki main.wrap{max-width:860px}.l-wiki h1{border-bottom:1px solid var(--border);padding-bottom:.2em;font-weight:500}.l-wiki h2{border-bottom:1px solid var(--border);font-weight:500}',
  search: '.l-search main.wrap{max-width:720px;margin-left:max(20px,calc(50% - 470px))}.l-search .result{background:none;border:0;padding-left:0}',
  social: '.l-social .site-header{position:sticky;top:0;z-index:5}.l-social .brand{font-size:1.5rem}.l-social main.wrap{padding-top:16px}.l-social h1{font-size:1.4rem}',
  portal: '',
};

const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));

/** Initials avatar; hue from the name so the same author keeps the same color. */
function avatar(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  return `<span class="avatar" style="background:hsl(${h},45%,42%)" aria-hidden="true">${esc(initials)}</span>`;
}

interface Ctx {
  href: (h: string) => string;
  image: (id: string | null | undefined, cls?: string) => string;
}

function block(b: ContentBlock, c: Ctx): string {
  switch (b.type) {
    case 'paragraph':
      return `<p>${esc(b.text)}</p>`;
    case 'list':
      return `<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
    case 'quote':
      return `<blockquote>${esc(b.text)}${b.cite ? `<div class="meta">— ${esc(b.cite)}</div>` : ''}</blockquote>`;
    case 'figure':
      return c.image(b.imageId).replace('</figure>', b.caption ? `<figcaption>${esc(b.caption)}</figcaption></figure>` : '</figure>');
    case 'teaser':
      return `<a class="teaser" href="${esc(c.href(b.href))}">${c.image(b.imageId, 'thumb')}${b.kicker ? `<span class="kicker">${esc(b.kicker)}</span>` : ''}<h3>${esc(b.title)}</h3>${
        b.summary ? `<p>${esc(b.summary)}</p>` : ''
      }</a>`;
    case 'post':
      return `<div class="card post"><div class="meta">${esc(b.author)} · ${esc(b.date)}${b.likes ? ` · ♥ ${compact(b.likes)}` : ''}</div><p>${esc(b.text)}</p></div>`;
    case 'social': {
      const replies = b.replies?.length
        ? `<div class="replies">${b.replies.map((r) => `<div class="reply"><b>${esc(r.author)}</b>${esc(r.text)}</div>`).join('')}</div>`
        : '';
      const actions = [
        b.likes != null ? `♥ ${compact(b.likes)}` : '',
        b.comments != null ? `💬 ${compact(b.comments)}` : '',
        b.shares != null ? `↻ ${compact(b.shares)}` : '',
      ].filter(Boolean);
      return `<article class="card social-post"><div class="head">${avatar(b.author)}<div class="who"><b>${esc(b.author)}</b><span class="meta">${
        b.handle ? `${esc(b.handle)} · ` : ''
      }${esc(b.time)}</span></div></div><p>${esc(b.text)}</p>${c.image(b.imageId)}${
        actions.length ? `<div class="actions">${actions.map((a) => `<span>${a}</span>`).join('')}</div>` : ''
      }${replies}</article>`;
    }
    case 'product': {
      const name = b.href ? `<a href="${esc(c.href(b.href))}"><strong>${esc(b.name)}</strong></a>` : `<strong>${esc(b.name)}</strong>`;
      return `<div class="card product">${c.image(b.imageId, 'thumb')}${name}<div class="price">${esc(b.price)}</div>${
        b.rating != null ? `<div class="rating">★ ${b.rating.toFixed(1)}</div>` : ''
      }<p>${esc(b.description)}</p></div>`;
    }
    case 'result':
      return `<div class="card result"><a href="${esc(c.href(b.url))}">${esc(b.title)}</a><div class="url">${esc(b.url)}</div><p>${esc(b.snippet)}</p></div>`;
  }
}

const anchor = (l: { href: string; text: string; description?: string }, href: (h: string) => string) =>
  `<a href="${esc(href(l.href))}"${l.description ? ` title="${esc(l.description)}"` : ''}>${esc(l.text)}</a>`;

const identity = (h: string) => h;

export interface PageParts {
  title: string;
  /** Skeleton theme + layout CSS. */
  css: string;
  /** Opening `<body>` class is set via `bodyClass`; header markup goes first. */
  bodyClass: string;
  header: string;
  main: string;
  footer: string;
}

/** Everything that depends only on the domain's skeleton, so it can be streamed before the content exists. */
export function renderChrome(s: SiteSkeleton, opts: RenderOptions = {}): Pick<PageParts, 'css' | 'bodyClass' | 'header'> & { footer: string } {
  const href = opts.linkHref ?? identity;
  const nav = s.nav.length ? `<nav class="site-nav">${s.nav.map((l) => anchor(l, href)).join('')}</nav>` : '';
  const footerLinks = s.footer.links.map((l) => anchor(l, href)).join('');
  return {
    css: skeletonCss(s) + LAYOUT_CSS[s.layout],
    bodyClass: `l-${s.layout}`,
    header: `<header class="site-header h-${s.headerStyle}"><div class="wrap"><a class="brand" href="${esc(href('/'))}">${esc(s.siteName)}</a>${
      s.tagline ? `<span class="tagline">${esc(s.tagline)}</span>` : ''
    }${nav}</div></header>`,
    footer: `<footer class="site-footer"><div class="wrap">${s.footer.text ? `<span>${esc(s.footer.text)}</span>` : ''}${footerLinks}</div></footer>${
      opts.showGeneratedIndicator === false ? '' : '<div class="generated">Generated</div>'
    }`,
  };
}

/** Blocks that sit side by side in a grid rather than in the text flow. */
const GRID_BLOCKS = new Set<ContentBlock['type']>(['teaser', 'product']);

export function renderPageParts(page: PageContent, skeleton: SiteSkeleton, opts: RenderOptions = {}): PageParts {
  const href = opts.linkHref ?? identity;
  const kind = pageKindOf(page);
  const chrome = renderChrome(skeleton, opts);
  const images = new Map(page.images.map((i) => [i.id, i]));
  const used = new Set<string>();

  const image = (id: string | null | undefined, cls = ''): string => {
    const spec = id ? images.get(id) : undefined;
    if (!spec) return '';
    used.add(spec.id);
    const src = opts.imageSrc?.(spec);
    const inner = src
      ? `<img src="${esc(src)}" alt="${esc(spec.alt)}" loading="lazy">`
      : `<div class="img" role="img" aria-label="${esc(spec.alt)}">${esc(spec.alt)}</div>`;
    return `<figure${cls ? ` class="${cls}"` : ''}>${inner}</figure>`;
  };
  const c: Ctx = { href, image };

  let heroDone = false;
  const sections = page.sections
    .map((s) => {
      const groups: string[] = [];
      let grid: string[] = [];
      const flush = () => {
        if (grid.length) groups.push(`<div class="grid">${grid.join('')}</div>`);
        grid = [];
      };
      for (const b of s.blocks) {
        if (!GRID_BLOCKS.has(b.type)) {
          flush();
          groups.push(block(b, c));
          continue;
        }
        let html = block(b, c);
        if (kind === 'front' && b.type === 'teaser' && !heroDone) {
          html = html.replace('class="teaser"', 'class="teaser hero"');
          heroDone = true;
        }
        grid.push(html);
      }
      flush();
      return `<section>${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}${groups.join('\n')}</section>`;
    })
    .join('\n');

  const lead = image(page.leadImageId, 'lead-figure');
  // Images the model described but never placed: show the first after the lead so they are not lost.
  const unplaced = page.images.filter((i) => !used.has(i.id)).slice(0, kind === 'article' ? 2 : 0);
  const extra = unplaced.map((i) => image(i.id)).join('');

  const profileHead =
    kind === 'profile' ? `<div class="profile-head">${avatar(page.title)}<div><h1>${esc(page.title)}</h1>${page.teaser ? `<p class="meta">${esc(page.teaser)}</p>` : ''}</div></div>` : '';
  const heading = profileHead || `<h1>${esc(page.title)}</h1>${page.teaser ? `<p class="lede">${esc(page.teaser)}</p>` : ''}`;
  const sidebar = ['feed', 'thread', 'profile'].includes(kind);
  const related = page.links.length
    ? `<aside class="related">${sidebar ? '<h2>Trending</h2>' : ''}<ul>${page.links.map((l: Link) => `<li>${anchor(l, href)}</li>`).join('')}</ul></aside>`
    : '';

  return {
    ...chrome,
    bodyClass: `${chrome.bodyClass} k-${kind}`,
    title: `${page.title} · ${skeleton.siteName}`,
    main: `<main class="wrap">${heading}${lead}${extra}\n${sections}${related}</main>`,
  };
}

/** Body of the error template. Shown, never cached. */
export function renderErrorParts(url: string, reason: string): PageParts {
  const chrome = renderChrome(defaultSkeleton(new URL(url).host));
  return {
    ...chrome,
    header: '',
    title: 'Page could not be generated',
    main: `<div class="notice"><h1>This page could not be generated</h1><p>${esc(reason)}</p>
<p class="meta">${esc(url)}</p><p><a href="${esc(url)}">Try again</a></p></div>`,
  };
}

export function documentHead(css = ''): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${BASE_CSS}${css}</style></head>`;
}

/** JSON → HTML. All model text is escaped; the model never writes markup or CSS (invariant 6). */
export function renderPage(page: PageContent, skeleton: SiteSkeleton = defaultSkeleton('site'), opts: RenderOptions = {}): string {
  const p = renderPageParts(page, skeleton, opts);
  return `${documentHead(p.css)}<body class="${p.bodyClass}"><title>${esc(p.title)}</title>${p.header}${p.main}${p.footer}</body></html>`;
}
