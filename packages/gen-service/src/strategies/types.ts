import type { Profile } from '@umwelt/profile';
import type { WorldState } from '../world/types.js';

export type Mode = 'A' | 'B' | 'C';

/** Mode-agnostic input to the planner. Everything downstream of `resolve()` only sees this. */
export interface PageInput {
  url: URL;
  mode: Mode;
  /** Mode B: original text nodes to rewrite. Mode C: extracted style profile. Mode A: none. */
  source?: { kind: 'text-nodes'; nodes: string[] } | { kind: 'style'; style: Record<string, string> };
}

export interface SourceStrategy {
  id: Mode;
  resolve(url: URL, profile: Profile, world: WorldState): Promise<PageInput>;
}
