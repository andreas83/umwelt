import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';

export const ROLES = ['planner', 'content', 'gallery', 'skeleton', 'image'] as const;
export type Role = (typeof ROLES)[number];

const ProviderSchema = z.object({
  baseUrl: z.url(),
  apiKeyEnv: z.string().min(1),
});

const RoleSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
});

export const ModelsConfigSchema = z
  .object({
    providers: z.record(z.string(), ProviderSchema),
    roles: z.partialRecord(z.enum(ROLES), RoleSchema),
  })
  .superRefine((cfg, ctx) => {
    for (const [role, r] of Object.entries(cfg.roles)) {
      if (r && !(r.provider in cfg.providers)) {
        ctx.addIssue({ code: 'custom', path: ['roles', role, 'provider'], message: `unknown provider "${r.provider}"` });
      }
    }
  });

export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;

export function parseModelsConfig(yamlText: string): ModelsConfig {
  return ModelsConfigSchema.parse(parse(yamlText));
}

export async function loadModelsConfig(path: string): Promise<ModelsConfig> {
  return parseModelsConfig(await readFile(path, 'utf8'));
}
