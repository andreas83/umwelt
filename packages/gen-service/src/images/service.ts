import { createHash } from 'node:crypto';
import type { ImageSpec } from '../generator/schema.js';
import type { GeneratedImage, ImageProvider, ImageRequest } from './types.js';

/** Reserved host for generated images. `.invalid` can never resolve to a real site. */
export const IMAGE_HOST = 'img.umwelt.invalid';

export interface ImageContext {
  profileId: string;
  worldSeed: string;
}

/**
 * Maps image specs in generated pages to stable URLs on {@link IMAGE_HOST}, and serves them on request.
 * Specs are registered when a page is rendered, so images generate lazily and in parallel as the browser asks.
 */
export class ImageService {
  private readonly specs = new Map<string, ImageRequest>();
  private readonly cache = new Map<string, Promise<GeneratedImage>>();

  constructor(
    private readonly provider: ImageProvider,
    /** Bound on in-memory image cache entries. */
    private readonly maxCached = 500,
  ) {}

  url(image: ImageSpec, ctx: ImageContext): string {
    const aspect = image.aspect ?? 'wide';
    const key = createHash('sha256')
      .update(JSON.stringify([this.provider.id, image.prompt, aspect, ctx.profileId, ctx.worldSeed]))
      .digest('hex')
      .slice(0, 32);
    this.specs.set(key, { prompt: image.prompt, alt: image.alt, aspect, seed: key });
    return `https://${IMAGE_HOST}/${key}`;
  }

  /** Bytes for an image URL path, or undefined if the key was never registered (e.g. after a restart). */
  serve(key: string): Promise<GeneratedImage> | undefined {
    const spec = this.specs.get(key);
    if (!spec) return undefined;
    let p = this.cache.get(key);
    if (!p) {
      p = this.provider.generate(spec);
      p.catch(() => this.cache.delete(key));
      this.cache.set(key, p);
      if (this.cache.size > this.maxCached) this.cache.delete(this.cache.keys().next().value!);
    }
    return p;
  }
}
