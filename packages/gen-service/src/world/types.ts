export interface WorldState {
  /** Changes only on explicit "refresh world". Part of the page cache key. */
  seed: string;
  /** ISO date shared by all news-like sites. */
  date: string;
}
