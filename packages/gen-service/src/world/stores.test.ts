import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileJsonStore, FileLinkStore } from './stores.js';

describe('file stores', () => {
  it('round-trips pages and keeps the first link description', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'umwelt-store-'));
    const pages = new FileJsonStore(join(dir, 'pages'));
    expect(await pages.get('k')).toBeUndefined();

    const links = await FileLinkStore.open(join(dir, 'links.json'));
    await links.add([{ url: 'https://a.test/', description: 'first' }]);
    await links.add([{ url: 'https://a.test/', description: 'second' }]);
    expect((await FileLinkStore.open(join(dir, 'links.json'))).get('https://a.test/')).toBe('first');
  });
});
