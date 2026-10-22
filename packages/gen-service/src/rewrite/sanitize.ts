import { parseHTML } from 'linkedom';
import { copyAsset, localizeCss, type AssetStore } from './assets.js';
import type { ImageSlot, PageTemplate, RawSnapshot, ResourceFetcher, SlotKind, TextSlot } from './types.js';

/** Elements that never survive: active content, embeds, resource hints, anything that could load or run something. */
const REMOVE = [
  'script', 'noscript', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'link', 'base', 'template',
  'portal', 'canvas', 'audio', 'video', 'track', 'source', 'dialog', 'style', 'meta[http-equiv]',
].join(',');

/** Cookie walls and consent managers that survived the in-page cleanup. */
const CONSENT = /(cookie|consent|gdpr|\bcmp\b|sp_message|didomi|onetrust|usercentrics|truste|qc-cmp|privacy-?banner|paywall)/i;

/** Text here is site furniture (menus, buttons, legal footers): it keeps the original wording. */
const CHROME_ANCESTORS = new Set(['nav', 'footer', 'button', 'label', 'select', 'option', 'form', 'time', 'code', 'pre', 'kbd', 'svg', 'math']);
const CHROME_ROLES = /^(navigation|banner|contentinfo|menu|menubar|tablist|button|search)$/;
const BLOCKS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'figcaption', 'blockquote', 'td', 'dd', 'dt', 'summary', 'caption', 'article', 'section', 'div', 'span', 'a']);
const HEADINGS = /^h[1-6]$/;
const BYLINE = /(author|byline)/i;
const LOGO = /logo|brand|masthead/i;

/** Smallest text that counts as content outside of headings, paragraphs and captions. */
const MIN_WORDS = 3;
/** Above this many slots, the rest of the page is cut so generation stays bounded. */
export const MAX_SLOTS = 600;

/** Paragraph-like blocks that are rewritten as a whole when they mix text and inline links. */
const RICH_BLOCKS = new Set(['P', 'LI', 'DD', 'TD', 'FIGCAPTION', 'BLOCKQUOTE']);
const INLINE = new Set(['A', 'B', 'I', 'EM', 'STRONG', 'SPAN', 'SUP', 'SUB', 'SMALL', 'ABBR', 'CITE', 'Q', 'MARK', 'U', 'S', 'BR', 'CODE', 'DFN', 'KBD', 'VAR', 'BDI', 'BDO', 'WBR']);

const MARK = (n: number) => `⟦${n}⟧`;
const IMG_MARK = (n: number) => `⟦img:${n}⟧`;

type Doc = ReturnType<typeof parseHTML>['document'];
type El = NonNullable<ReturnType<Doc['querySelector']>>;
type DomNode = Doc['body']['childNodes'][number];

function words(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function absolute(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function attrText(el: El): string {
  return `${el.getAttribute('class') ?? ''} ${el.getAttribute('id') ?? ''} ${el.getAttribute('itemprop') ?? ''} ${el.getAttribute('rel') ?? ''}`;
}

/** Walks up from a text node and decides whether it is content, and what kind. */
function classify(node: DomNode, text: string): { kind: SlotKind; tag: string; href: string | null } | null {
  let tag = '';
  let href: string | null = null;
  let heading = false;
  let byline = false;
  let caption = false;
  let quote = false;
  let insideArticle = false;
  let siteHeader = false;

  for (let el = node.parentElement as El | null; el; el = el.parentElement as El | null) {
    const name = el.tagName.toLowerCase();
    if (CHROME_ANCESTORS.has(name)) return null;
    const role = el.getAttribute('role');
    if (role && CHROME_ROLES.test(role)) return null;
    if (el.getAttribute('aria-hidden') === 'true') return null;
    if (!tag && BLOCKS.has(name) && name !== 'span' && name !== 'a') tag = name;
    if (name === 'a' && !href) href = el.getAttribute('href');
    if (HEADINGS.test(name)) heading = true;
    if (name === 'figcaption') caption = true;
    if (name === 'blockquote' || name === 'q') quote = true;
    if (name === 'article' || name === 'main') insideArticle = true;
    if (name === 'header') siteHeader = true;
    if (BYLINE.test(attrText(el))) byline = true;
  }
  // A <header> outside any article/main is the site masthead: furniture.
  if (siteHeader && !insideArticle && !heading) return null;

  const n = words(text);
  const kind: SlotKind = byline ? 'byline' : heading ? 'headline' : caption ? 'caption' : quote ? 'quote' : href ? 'link' : 'text';
  const structural = heading || caption || quote || byline || tag === 'p';
  if (n < (byline ? 2 : structural ? 1 : MIN_WORDS)) return null;
  return { kind, tag: tag || 'div', href };
}

/** Attributes that carry the real page's wording into tooltips and alt text. */
const TEXT_ATTRIBUTES = new Set(['title', 'alt', 'aria-label', 'aria-description', 'aria-roledescription']);

function stripAttributes(el: El, base: string): void {
  for (const { name, value } of [...el.attributes]) {
    const n = name.toLowerCase();
    if (TEXT_ATTRIBUTES.has(n) && el.tagName !== 'INPUT') {
      // The alt of a content image is kept aside (as the image prompt) before this runs.
      el.removeAttribute(name);
      continue;
    }
    if (n.startsWith('on') || n === 'srcset' || n === 'sizes' || n === 'nonce' || n === 'integrity' || n === 'srcdoc' || n === 'formaction' || n === 'ping') {
      el.removeAttribute(name);
    } else if ((n === 'href' || n === 'xlink:href' || n === 'action') && !value.startsWith('#')) {
      el.setAttribute(name, absolute(value, base) ?? '#');
    } else if (n === 'style' && /url\(|expression|@import/i.test(value)) {
      el.setAttribute(name, value.replace(/url\([^)]*\)/gi, 'none').replace(/expression|@import/gi, ''));
    }
  }
}

export interface PrepareDeps {
  fetcher: ResourceFetcher;
  assets: AssetStore;
}

/**
 * Real page → profile-independent template: active content removed, assets copied locally, content text and
 * content images replaced by numbered markers. The result references nothing outside the reserved hosts.
 */
export async function prepareTemplate(raw: RawSnapshot, deps: PrepareDeps): Promise<PageTemplate> {
  const base = raw.finalUrl;
  const { document } = parseHTML(raw.html);

  for (const el of [...document.querySelectorAll(REMOVE)]) el.remove();
  for (const el of [...document.querySelectorAll('[id],[class]')] as El[]) {
    if (CONSENT.test(`${el.getAttribute('id') ?? ''} ${el.getAttribute('class') ?? ''}`) && el.tagName !== 'BODY' && el.tagName !== 'HTML') el.remove();
  }

  // Invariant 2: credential and payment fields are inert and empty.
  for (const el of [...document.querySelectorAll('input,textarea')] as El[]) {
    const type = (el.getAttribute('type') ?? '').toLowerCase();
    const auto = (el.getAttribute('autocomplete') ?? '').toLowerCase();
    if (type === 'password' || /cc-|card|password/.test(auto) || el.tagName === 'TEXTAREA') el.setAttribute('disabled', '');
    el.removeAttribute('value');
  }

  // Images: logos are copied as-is, everything else becomes a generated image.
  const images: ImageSlot[] = [];
  for (const img of [...document.querySelectorAll('img')] as El[]) {
    const src = img.getAttribute('src') ?? img.getAttribute('data-src') ?? '';
    const abs = absolute(src, base);
    let el: El | null = img;
    let logo = false;
    for (let depth = 0; el && depth < 4; depth++, el = el.parentElement as El | null) {
      if (LOGO.test(`${attrText(el)} ${el.getAttribute('alt') ?? ''}`)) logo = true;
    }
    if (logo && abs) {
      const local = await copyAsset(abs, deps.fetcher, deps.assets, /^image\//);
      if (local) {
        img.setAttribute('src', local);
        continue;
      }
    }
    const width = Number(img.getAttribute('width')) || null;
    const height = Number(img.getAttribute('height')) || null;
    const id = images.length;
    images.push({ id, alt: (img.getAttribute('alt') ?? '').trim(), width, height });
    img.setAttribute('src', IMG_MARK(id));
    img.setAttribute('loading', 'lazy');
    for (const a of ['data-src', 'data-srcset', 'data-lazy-src']) img.removeAttribute(a);
  }

  for (const el of [...document.querySelectorAll('*')] as El[]) stripAttributes(el, base);

  // Text: escape stray markers, then replace content text with slot markers.
  const slots: TextSlot[] = [];
  const titleEl = document.querySelector('title');
  if (titleEl?.textContent?.trim()) {
    slots.push({ id: 0, kind: 'title', tag: 'title', href: null, words: words(titleEl.textContent), original: titleEl.textContent.trim().slice(0, 200) });
    titleEl.textContent = MARK(0);
  }
  /** A paragraph of text with inline links becomes one slot, so the rewritten sentence flows around its links. */
  const richBlock = (el: El): boolean => {
    if (!RICH_BLOCKS.has(el.tagName)) return false;
    let hasLink = false;
    for (const d of [...el.querySelectorAll('*')] as El[]) {
      if (!INLINE.has(d.tagName)) return false;
      if (d.tagName === 'A' && d.textContent?.trim()) hasLink = true;
    }
    return hasLink;
  };

  const takeRich = (el: El): boolean => {
    const firstText = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent?.trim()) ?? el.firstChild;
    const text = (el.textContent ?? '').replace(/[⟦⟧]/g, '');
    const c = firstText ? classify(firstText as DomNode, text) : null;
    if (!c || slots.length >= MAX_SLOTS) return false;
    const links: NonNullable<TextSlot['links']> = [];
    let original = '';
    const flatten = (n: DomNode): void => {
      for (const ch of [...n.childNodes]) {
        if (ch.nodeType === 3) original += ch.textContent ?? '';
        else if (ch.nodeType === 1 && (ch as El).tagName === 'A' && (ch as El).textContent?.trim()) {
          const a = ch as El;
          links.push({ n: links.length + 1, href: a.getAttribute('href') ?? '#', className: a.getAttribute('class') });
          original += `[[${links.length}:${(a.textContent ?? '').trim()}]]`;
        } else if (ch.nodeType === 1) flatten(ch as DomNode);
      }
    };
    flatten(el as unknown as DomNode);
    original = original.replace(/[⟦⟧]/g, '').replace(/\s+/g, ' ').trim();
    const id = slots.length;
    slots.push({ id, kind: c.kind === 'link' ? 'text' : c.kind, tag: el.tagName.toLowerCase(), href: null, words: words(original), original: original.slice(0, 400), links });
    el.textContent = MARK(id);
    return true;
  };

  const walk = (node: DomNode | Doc['body']): void => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 1 && richBlock(child as El) && takeRich(child as El)) continue;
      if (child.nodeType === 3) {
        const text = (child.textContent ?? '').replace(/[⟦⟧]/g, '');
        child.textContent = text;
        if (!text.trim() || slots.length >= MAX_SLOTS) continue;
        const c = classify(child, text);
        if (!c) continue;
        const id = slots.length;
        slots.push({ id, kind: c.kind, tag: c.tag, href: c.href, words: words(text), original: text.trim().replace(/\s+/g, ' ').slice(0, 200) });
        // Keep surrounding whitespace so inline layout doesn't change.
        child.textContent = `${/^\s/.test(text) ? ' ' : ''}${MARK(id)}${/\s$/.test(text) ? ' ' : ''}`;
      } else if (child.nodeType === 1) {
        walk(child);
      }
    }
  };
  if (document.body) walk(document.body);

  // Stylesheets in document order, localized, as one block in <head>.
  const css: string[] = [];
  for (const s of raw.stylesheets) {
    let text = s.text;
    let sheetBase = base;
    if (text === null && s.href) {
      const res = await deps.fetcher.fetch(s.href);
      text = res && /css|text\/plain/.test(res.contentType) ? new TextDecoder().decode(res.bytes) : null;
      sheetBase = s.href;
    }
    if (!text) continue;
    const local = await localizeCss(text, sheetBase, deps.fetcher, deps.assets);
    css.push(s.media && s.media !== 'all' ? `@media ${s.media}{${local}}` : local);
  }
  const style = document.createElement('style');
  style.textContent = css.join('\n').replace(/<\/style/gi, '<\\/style');
  document.head?.appendChild(style);

  const html = document.documentElement.outerHTML.replace(/^<!doctype[^>]*>/i, '');
  const substantial = slots.filter((s) => s.words > 6 && s.kind !== 'link' && s.kind !== 'title').length;
  const loginWall = !!document.querySelector('input[type=password]') && substantial < 12;
  return { url: raw.url, host: new URL(base).hostname, html, slots, images, loginWall, createdAt: new Date().toISOString() };
}
