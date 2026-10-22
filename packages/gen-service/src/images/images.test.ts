import { describe, expect, it } from 'vitest';
import { PlaceholderImageProvider } from './placeholder.js';
import { IMAGE_HOST, ImageService } from './service.js';

const spec = { id: 'i1', prompt: 'A harbour at dawn', alt: 'Harbour', aspect: 'wide' as const };
const ctx = { profileId: 'p', worldSeed: 's' };

describe('images', () => {
  it('placeholders are deterministic SVG without model text', async () => {
    const p = new PlaceholderImageProvider();
    const a = await p.generate({ prompt: '<script>x</script>', alt: 'a', aspect: 'square', seed: 'k' });
    const b = await p.generate({ prompt: '<script>x</script>', alt: 'a', aspect: 'square', seed: 'k' });
    const svg = new TextDecoder().decode(a.bytes);
    expect(svg).toBe(new TextDecoder().decode(b.bytes));
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 800 800"/);
    expect(svg).not.toContain('script');
  });

  it('maps specs to stable URLs on the reserved host and serves them', async () => {
    const images = new ImageService(new PlaceholderImageProvider());
    const url = new URL(images.url(spec, ctx));
    expect(url.host).toBe(IMAGE_HOST);
    expect(images.url(spec, ctx)).toBe(url.toString());
    expect(images.url(spec, { ...ctx, worldSeed: 'other' })).not.toBe(url.toString());
    expect((await images.serve(url.pathname.slice(1)))?.contentType).toBe('image/svg+xml');
    expect(images.serve('unknown')).toBeUndefined();
  });
});
