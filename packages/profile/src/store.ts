import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ProfileSchema, type Profile } from './schema.js';

/** Encrypts at rest. The shell provides one backed by the OS keychain. */
export interface Cipher {
  encrypt(plain: string): Promise<Buffer>;
  decrypt(data: Buffer): Promise<string>;
}

export const DEFAULT_PROFILE: Profile = ProfileSchema.parse({
  id: 'default',
  name: 'Neutral',
  orientation: { political: 0, religious: 0, sexual: 0 },
});

/** Invariant 3: the profile lives only in this encrypted file, never in logs. */
export class EncryptedProfileStore {
  constructor(
    private readonly path: string,
    private readonly cipher: Cipher,
  ) {}

  async load(): Promise<Profile> {
    let data: Buffer;
    try {
      data = await readFile(this.path);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return DEFAULT_PROFILE;
      throw e;
    }
    return ProfileSchema.parse(JSON.parse(await this.cipher.decrypt(data)));
  }

  async save(input: unknown): Promise<Profile> {
    const profile = ProfileSchema.parse(input);
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    await writeFile(tmp, await this.cipher.encrypt(JSON.stringify(profile)), { mode: 0o600 });
    await rename(tmp, this.path);
    return profile;
  }
}
