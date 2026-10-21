export const SEARCH_URL = 'https://search.lookabout.com/search';

/** Address-bar input → URL. Bare words go to the synthetic search engine. */
export function addressToUrl(input: string): string {
  const s = input.trim();
  if (/^(https?|umwelt):\/\//i.test(s)) return s;
  if (/^[^\s/]+\.[a-z]{2,}(\/\S*)?$/i.test(s)) return `https://${s}`;
  const u = new URL(SEARCH_URL);
  u.searchParams.set('q', s);
  return u.toString();
}
