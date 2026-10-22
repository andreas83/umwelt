import { describe, expect, it } from 'vitest';
import { defaultSkeleton } from '../skeleton/schema.js';
import { renderErrorParts, renderPage, renderPageParts } from './render.js';

const page = {
  siteName: 'Site',
  pageType: 'blog' as const,
  title: '<script>alert(1)</script>',
  sections: [{ blocks: [{ type: 'paragraph' as const, text: 'a & b' }] }],
  links: [{ href: 'javascript:alert(1)', text: 'x', description: 'y' }],
  images: [],
};

describe('renderPage', () => {
  it('escapes all model text', () => {
    const html = renderPage(page, defaultSkeleton('a.test'), { linkHref: () => '#' });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('a &amp; b');
    expect(html).not.toContain('javascript:');
  });

  it('shows the generated indicator by default', () => {
    expect(renderPage(page)).toContain('class="generated"');
    expect(renderPage(page, defaultSkeleton('a.test'), { showGeneratedIndicator: false })).not.toContain('class="generated"');
  });

  it('uses the skeleton for name, nav and layout', () => {
    const sk = { ...defaultSkeleton('a.test'), siteName: 'The <Ledger>', layout: 'forum' as const, nav: [{ text: 'Local', href: '/local' }] };
    const p = renderPageParts(page, sk, { linkHref: (h) => `https://a.test${h}` });
    expect(p.header).toContain('The &lt;Ledger&gt;');
    expect(p.header).toContain('href="https://a.test/local"');
    expect(p.bodyClass).toBe('l-forum k-article');
    expect(p.title).toContain('The <Ledger>'); // escaped where it is written into the document
  });

  it('routes search-result links through linkHref', () => {
    const parts = renderPageParts(
      { ...page, sections: [{ blocks: [{ type: 'result', title: 'T', url: 'javascript:x', snippet: 's' }] }] },
      defaultSkeleton('a.test'),
      { linkHref: () => '#' },
    );
    expect(parts.main).toContain('<a href="#">T</a>');
  });

  it('error template always carries the indicator', () => {
    expect(renderErrorParts('https://a.test/x', 'nope').footer).toContain('class="generated"');
  });

  it('front pages put teasers in a grid with a hero, and use image URLs', () => {
    const front = {
      ...page,
      pageKind: 'front' as const,
      images: [{ id: 'a', prompt: 'p', alt: 'Alt <a>', aspect: 'wide' as const }],
      sections: [
        {
          heading: 'Top',
          blocks: [
            { type: 'teaser' as const, title: 'Lead', href: '/lead', imageId: 'a' },
            { type: 'teaser' as const, title: 'Second', href: '/second' },
          ],
        },
      ],
    };
    const p = renderPageParts(front, defaultSkeleton('a.test'), { imageSrc: () => 'https://img.umwelt.invalid/k' });
    expect(p.bodyClass).toContain('k-front');
    expect(p.main).toContain('<div class="grid"><a class="teaser hero" href="/lead">');
    expect(p.main).toContain('<img src="https://img.umwelt.invalid/k" alt="Alt &lt;a&gt;"');
  });

  it('feeds render social posts with counts, replies and a sidebar', () => {
    const feed = {
      ...page,
      pageKind: 'feed' as const,
      sections: [
        {
          blocks: [
            { type: 'social' as const, author: 'Ada Lovelace', time: '2h', text: 'Hi', likes: 1520, replies: [{ author: 'Bob', text: 'Yo' }] },
          ],
        },
      ],
    };
    const p = renderPageParts(feed, defaultSkeleton('a.test'));
    expect(p.main).toContain('class="card social-post"');
    expect(p.main).toContain('♥ 1.5K');
    expect(p.main).toContain('>AL</span>');
    expect(p.main).toContain('<h2>Trending</h2>');
  });

  it('infers a kind for pages cached before kinds existed', () => {
    expect(renderPageParts(page, defaultSkeleton('a.test')).bodyClass).toContain('k-article');
  });

  it('sidebar rule outranks the column-1 rule for feed children', async () => {
    const { BASE_CSS } = await import('./render.js');
    // `main.wrap>*` pins children to column 1; the sidebar selector must be more specific to reach column 2.
    expect(BASE_CSS).toContain('.k-feed main.wrap>.related');
  });
});
