import { describe, expect, it } from 'vitest';
import { addressToUrl } from './address.js';

describe('addressToUrl', () => {
  it('keeps URLs, adds https to hostnames, searches the rest', () => {
    expect(addressToUrl('https://a.test/x')).toBe('https://a.test/x');
    expect(addressToUrl('news.example.org/today')).toBe('https://news.example.org/today');
    expect(addressToUrl('best bread recipe')).toBe('https://search.lookabout.com/search?q=best+bread+recipe');
    expect(addressToUrl('file:///etc/passwd')).toMatch(/^https:\/\/search/);
  });
});
