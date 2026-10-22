import type { ImageAspect } from '../generator/schema.js';

export interface ImageRequest {
  prompt: string;
  alt: string;
  aspect: ImageAspect;
  /** Stable per (prompt, aspect, profile, world): same request, same image. */
  seed: string;
}

export interface GeneratedImage {
  contentType: string;
  bytes: Uint8Array;
}

/** Swappable image source. A real model plugs in here; nothing else changes. */
export interface ImageProvider {
  id: string;
  generate(req: ImageRequest): Promise<GeneratedImage>;
}

export const ASPECT_SIZE: Record<ImageAspect, [number, number]> = {
  wide: [1200, 675],
  square: [800, 800],
  portrait: [720, 960],
};
