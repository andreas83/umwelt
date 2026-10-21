import type { SourceStrategy } from './types.js';

/** Mode A: no real-site fetch; the page is generated from the URL alone. */
export const pureGen: SourceStrategy = {
  id: 'A',
  async resolve(url) {
    return { url, mode: 'A' };
  },
};
