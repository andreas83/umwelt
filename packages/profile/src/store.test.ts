import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, EncryptedProfileStore, type Cipher } from './store.js';

// Reversible stand-in for the OS keychain cipher.
const xor: Cipher = {
  encrypt: async (s) => Buffer.from(Buffer.from(s).map((b) => b ^ 0x5a)),
  decrypt: async (b) => Buffer.from(b.map((x) => x ^ 0x5a)).toString(),
};

describe('EncryptedProfileStore', () => {
  it('defaults, round-trips, and never stores plaintext', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'umwelt-profile-')), 'profile.enc');
    const store = new EncryptedProfileStore(path, xor);
    expect(await store.load()).toEqual(DEFAULT_PROFILE);

    await store.save({ id: 'me', name: 'Secret Name', interests: ['falconry'] });
    expect((await store.load()).interests).toEqual(['falconry']);
    expect((await readFile(path)).toString()).not.toContain('falconry');
  });

  it('rejects invalid profiles', async () => {
    const store = new EncryptedProfileStore(join(tmpdir(), 'never.enc'), xor);
    await expect(store.save({ id: '', name: 'x' })).rejects.toThrow();
  });
});
