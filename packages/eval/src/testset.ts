import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ProfileSchema, type Profile } from '@umwelt/profile';
import { PAGE_TYPES } from '@umwelt/gen-service';
import { z } from 'zod';
import { evalDataDir } from './paths.js';

const TestUrlSchema = z.object({ id: z.string(), type: z.enum(PAGE_TYPES), url: z.url() });
export type TestUrl = z.infer<typeof TestUrlSchema>;

export interface TestSet {
  urls: TestUrl[];
  profiles: Profile[];
}

export async function loadTestSet(): Promise<TestSet> {
  const read = async (f: string): Promise<unknown> => JSON.parse(await readFile(join(evalDataDir, f), 'utf8'));
  return {
    urls: z.array(TestUrlSchema).parse(await read('urls.json')),
    profiles: z.array(ProfileSchema).parse(await read('profiles.json')),
  };
}
