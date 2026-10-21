import type { Profile } from './schema.js';

type Axis = keyof Profile['orientation'];

/** Wording for each axis end: [negative pole, positive pole]. */
const POLES: Record<Axis, [string, string]> = {
  political: ['left / progressive', 'right / conservative'],
  religious: ['secular / non-religious', 'religious / devout'],
  sexual: ['queer / LGBTQ+', 'heterosexual / traditional family'],
};

function intensity(v: number): string {
  const a = Math.abs(v);
  return a >= 0.8 ? 'strongly' : a >= 0.4 ? 'moderately' : 'slightly';
}

export function describeAxis(axis: Axis, value: number | null): string | null {
  if (value === null) return null;
  if (Math.abs(value) < 0.1) return `${axis}: balanced, no lean`;
  const [neg, pos] = POLES[axis];
  return `${axis}: ${intensity(value)} ${value < 0 ? neg : pos}`;
}

/** Plain-text profile for the prompt's stable prefix. Deterministic: same profile, same bytes (prompt caching). */
export function describeProfile(p: Profile): string {
  const axes = (Object.keys(POLES) as Axis[]).flatMap((a) => describeAxis(a, p.orientation[a]) ?? []);
  return [
    `Tone: ${p.tone}`,
    `Reading level: ${p.readingLevel}`,
    `Language: ${p.language}${p.region ? ` (region: ${p.region})` : ''}`,
    `Interests: ${p.interests.length ? p.interests.join(', ') : 'none in particular'}`,
    `Worldview: ${axes.length ? axes.join('; ') : 'unspecified'}`,
    `Profile strength: ${Math.round(p.strength * 100)}% (how strongly the worldview shapes content)`,
  ].join('\n');
}
