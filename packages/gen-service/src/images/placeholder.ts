import { createHash } from 'node:crypto';
import { ASPECT_SIZE, type GeneratedImage, type ImageProvider, type ImageRequest } from './types.js';

/** Deterministic stream of numbers in [0, 1) from a seed. */
function rng(seed: string): () => number {
  let pool = createHash('sha256').update(seed).digest();
  let i = 0;
  return () => {
    if (i + 4 > pool.length) {
      pool = createHash('sha256').update(pool).digest();
      i = 0;
    }
    const v = pool.readUInt32BE(i) / 2 ** 32;
    i += 4;
    return v;
  };
}

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${Math.round(h)},${Math.round(s)}%,${Math.round(l)}%,${a.toFixed(2)})`;

/**
 * Abstract SVG artwork seeded by the image request: a gradient sky, layered hills or blocks, soft shapes.
 * Free and instant; stands in until a real image model is configured. Contains no model text.
 */
export class PlaceholderImageProvider implements ImageProvider {
  readonly id = 'placeholder';

  async generate(req: ImageRequest): Promise<GeneratedImage> {
    const r = rng(`${req.seed}|${req.prompt}`);
    const [w, h] = ASPECT_SIZE[req.aspect];
    const hue = r() * 360;
    const spread = 25 + r() * 60;
    const parts: string[] = [];

    parts.push(
      `<defs><linearGradient id="g" x1="0" y1="0" x2="${r() > 0.5 ? 1 : 0}" y2="1">` +
        `<stop offset="0" stop-color="${hsl(hue, 55 + r() * 30, 70 + r() * 15)}"/>` +
        `<stop offset="1" stop-color="${hsl(hue + spread, 45 + r() * 30, 35 + r() * 25)}"/></linearGradient>` +
        `<filter id="b"><feGaussianBlur stdDeviation="${Math.round(w / 60)}"/></filter></defs>`,
      `<rect width="${w}" height="${h}" fill="url(#g)"/>`,
    );

    // Soft light sources.
    const glows = 2 + Math.floor(r() * 3);
    for (let i = 0; i < glows; i++) {
      parts.push(
        `<circle cx="${Math.round(r() * w)}" cy="${Math.round(r() * h * 0.6)}" r="${Math.round((0.08 + r() * 0.2) * w)}" ` +
          `fill="${hsl(hue + r() * 120 - 60, 70, 80, 0.35 + r() * 0.3)}" filter="url(#b)"/>`,
      );
    }

    // Either rolling hills or a skyline of blocks.
    const layers = 2 + Math.floor(r() * 3);
    const skyline = r() > 0.55;
    for (let l = 0; l < layers; l++) {
      const base = h * (0.55 + (l / layers) * 0.35);
      const fill = hsl(hue + spread + l * 12, 30 + r() * 25, Math.max(8, 45 - l * 11 - r() * 8), 0.9);
      if (skyline) {
        let x = 0;
        const rects: string[] = [];
        while (x < w) {
          const bw = (0.04 + r() * 0.1) * w;
          const bh = (0.08 + r() * 0.3) * h * (1 - l * 0.15);
          rects.push(`<rect x="${Math.round(x)}" y="${Math.round(base - bh)}" width="${Math.ceil(bw)}" height="${Math.ceil(h - base + bh)}"/>`);
          x += bw;
        }
        parts.push(`<g fill="${fill}">${rects.join('')}</g>`);
      } else {
        const amp = (0.04 + r() * 0.1) * h;
        const freq = 1 + r() * 2.5;
        const phase = r() * Math.PI * 2;
        const pts = Array.from({ length: 25 }, (_, i) => {
          const x = (i / 24) * w;
          return `${Math.round(x)},${Math.round(base - amp * Math.sin((i / 24) * Math.PI * freq + phase))}`;
        });
        parts.push(`<polygon fill="${fill}" points="0,${h} ${pts.join(' ')} ${w},${h}"/>`);
      }
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${parts.join('')}</svg>`;
    return { contentType: 'image/svg+xml', bytes: new TextEncoder().encode(svg) };
  }
}
