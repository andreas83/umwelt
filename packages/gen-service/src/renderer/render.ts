import type { ContentBlock, PageContent } from '../generator/schema.js';
import { esc } from './escape.js';

export interface RenderOptions {
  /** Maps a generated link to the href used in the page. Default: the link's own href. */
  linkHref?: (link: PageContent['links'][number]) => string;
  /** Invariant 4: on by default. */
  showGeneratedIndicator?: boolean;
}

const BASE_CSS = `
body{margin:0;font:16px/1.55 system-ui,sans-serif;color:#1d1d1f;background:#fff}
header,main,footer{max-width:760px;margin:0 auto;padding:16px}
header{border-bottom:1px solid #ddd}.site{font-weight:700;font-size:1.1rem}
h1{font-size:1.9rem;line-height:1.2}.teaser{color:#555;font-size:1.1rem}
blockquote{border-left:3px solid #ccc;margin:1em 0;padding-left:1em;color:#444}
.post,.product,.result{border:1px solid #e3e3e3;border-radius:6px;padding:10px 14px;margin:10px 0}
.meta{color:#777;font-size:.85rem}.price{font-weight:700}.result .url{color:#1a7f37;font-size:.85rem}
.img{background:#eee;color:#777;padding:40px 12px;text-align:center;border-radius:6px;font-size:.85rem}
.generated{position:fixed;right:10px;bottom:10px;background:#111;color:#fff;font:600 12px system-ui;padding:4px 8px;border-radius:4px;opacity:.85}
footer{border-top:1px solid #ddd;font-size:.9rem}footer li{margin:4px 0}
`;

function block(b: ContentBlock): string {
  switch (b.type) {
    case 'paragraph':
      return `<p>${esc(b.text)}</p>`;
    case 'list':
      return `<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
    case 'quote':
      return `<blockquote>${esc(b.text)}${b.cite ? `<div class="meta">— ${esc(b.cite)}</div>` : ''}</blockquote>`;
    case 'post':
      return `<div class="post"><div class="meta">${esc(b.author)} · ${esc(b.date)}</div><p>${esc(b.text)}</p></div>`;
    case 'product':
      return `<div class="product"><strong>${esc(b.name)}</strong> <span class="price">${esc(b.price)}</span><p>${esc(b.description)}</p></div>`;
    case 'result':
      return `<div class="result"><a href="#">${esc(b.title)}</a><div class="url">${esc(b.url)}</div><p>${esc(b.snippet)}</p></div>`;
  }
}

/** JSON → HTML. All model text is escaped; the model never writes markup (invariant 6). */
export function renderPage(page: PageContent, opts: RenderOptions = {}): string {
  const href = opts.linkHref ?? ((l) => l.href);
  const sections = page.sections
    .map((s) => `<section>${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}${s.blocks.map(block).join('\n')}</section>`)
    .join('\n');
  const images = page.images.map((i) => `<div class="img" role="img" aria-label="${esc(i.alt)}">${esc(i.alt)}</div>`).join('');
  const links = page.links.length
    ? `<ul>${page.links.map((l) => `<li><a href="${esc(href(l))}" title="${esc(l.description)}">${esc(l.text)}</a></li>`).join('')}</ul>`
    : '';
  const indicator = opts.showGeneratedIndicator === false ? '' : '<div class="generated">Generated</div>';

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(page.title)} · ${esc(page.siteName)}</title><style>${BASE_CSS}</style></head><body>
<header><div class="site">${esc(page.siteName)}</div></header>
<main><h1>${esc(page.title)}</h1>${page.teaser ? `<p class="teaser">${esc(page.teaser)}</p>` : ''}${images}
${sections}</main>
<footer>${links}</footer>${indicator}</body></html>`;
}
