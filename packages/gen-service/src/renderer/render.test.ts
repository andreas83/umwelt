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
    expect(p.bodyClass).toBe('l-forum');
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
});
