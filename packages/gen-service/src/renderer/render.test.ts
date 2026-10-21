import { describe, expect, it } from 'vitest';
import { renderPage } from './render.js';

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
    const html = renderPage(page, { linkHref: () => '#' });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('a &amp; b');
    expect(html).not.toContain('javascript:');
  });

  it('shows the generated indicator by default', () => {
    expect(renderPage(page)).toContain('class="generated"');
    expect(renderPage(page, { showGeneratedIndicator: false })).not.toContain('class="generated"');
  });
});
