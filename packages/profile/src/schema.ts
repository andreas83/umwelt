import { z } from 'zod';

/** Position on an orientation axis: -1 .. 1, 0 = neutral. `null` = axis not applied. */
const axis = z.number().min(-1).max(1).nullable();

export const ProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tone: z.string().default('neutral'),
  readingLevel: z.enum(['simple', 'standard', 'expert']).default('standard'),
  language: z.string().default('en'),
  region: z.string().optional(),
  interests: z.array(z.string()).default([]),
  orientation: z
    .object({
      political: axis.default(null),
      religious: axis.default(null),
      sexual: axis.default(null),
    })
    .default({ political: null, religious: null, sexual: null }),
  /** How strongly the profile shapes generated content, 0 .. 1. */
  strength: z.number().min(0).max(1).default(1),
  /** Per-domain overrides, keyed by hostname. */
  domainOverrides: z.record(z.string(), z.lazy(() => ProfileOverrideSchema)).default({}),
});

export const ProfileOverrideSchema = z.object({
  tone: z.string().optional(),
  readingLevel: z.enum(['simple', 'standard', 'expert']).optional(),
  interests: z.array(z.string()).optional(),
  strength: z.number().min(0).max(1).optional(),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type ProfileOverride = z.infer<typeof ProfileOverrideSchema>;

export function parseProfile(input: unknown): Profile {
  return ProfileSchema.parse(input);
}
