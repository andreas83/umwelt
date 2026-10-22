import { ProfileSchema, type Profile } from './schema.js';

/**
 * Contrasting profiles at full strength: for the compare view, exhibitions and the bake-off.
 * `examples/profiles/*.json` mirror these.
 */
export const PRESETS: readonly Profile[] = [
  {
    id: 'neutral',
    name: 'Neutral',
    tone: 'plain, informative',
    interests: [],
    orientation: { political: 0, religious: 0, sexual: 0 },
  },
  {
    id: 'progressive',
    name: 'Progressive, secular, queer',
    tone: 'warm, earnest',
    interests: ['climate', 'cycling', 'plant-based cooking'],
    orientation: { political: -0.9, religious: -0.8, sexual: -0.9 },
  },
  {
    id: 'traditional',
    name: 'Conservative, devout, traditional family',
    tone: 'measured, community-minded',
    interests: ['family', 'gardening', 'local history'],
    orientation: { political: 0.9, religious: 0.9, sexual: 0.9 },
  },
  {
    id: 'mixed',
    name: 'Right-libertarian, secular, queer-friendly',
    tone: 'dry, sardonic',
    interests: ['technology', 'cars', 'personal finance'],
    orientation: { political: 0.6, religious: -0.7, sexual: -0.5 },
  },
].map((p) => ProfileSchema.parse({ ...p, strength: 1 }));

export function preset(id: string): Profile | undefined {
  return PRESETS.find((p) => p.id === id);
}
