import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';

export const ROLES = ['planner', 'content', 'gallery', 'skeleton', 'image', 'judge'] as const;
export type Role = (typeof ROLES)[number];

const ProviderSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('anthropic'), apiKeyEnv: z.string().min(1), baseUrl: z.url().optional() }),
  z.object({ kind: z.literal('openai-compatible'), apiKeyEnv: z.string().min(1), baseUrl: z.url() }),
]);

/** USD per 1M tokens. */
const PricingSchema = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cachedInput: z.number().nonnegative().optional(),
});

const ModelSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  pricing: PricingSchema,
  /** Passed through to the provider request body as-is. */
  params: z.record(z.string(), z.unknown()).default({}),
  maxTokensParam: z.enum(['max_tokens', 'max_completion_tokens']).default('max_tokens'),
  /** Constrain output to the request's `responseSchema` (Anthropic `output_config.format`). */
  structuredOutput: z.boolean().default(false),
});

export const ModelsConfigSchema = z
  .object({
    providers: z.record(z.string(), ProviderSchema),
    models: z.record(z.string(), ModelSchema),
    roles: z.partialRecord(z.enum(ROLES), z.string()),
    eval: z.object({ candidates: z.array(z.string()) }).default({ candidates: [] }),
  })
  .superRefine((cfg, ctx) => {
    for (const [alias, m] of Object.entries(cfg.models)) {
      const provider = cfg.providers[m.provider];
      if (!provider) {
        ctx.addIssue({ code: 'custom', path: ['models', alias, 'provider'], message: `unknown provider "${m.provider}"` });
      } else if (m.structuredOutput && provider.kind !== 'anthropic') {
        ctx.addIssue({ code: 'custom', path: ['models', alias, 'structuredOutput'], message: 'only supported for anthropic providers' });
      }
    }
    const refs: [string[], string][] = [
      ...Object.entries(cfg.roles).map(([role, alias]): [string[], string] => [['roles', role], alias ?? '']),
      ...cfg.eval.candidates.map((alias, i): [string[], string] => [['eval', 'candidates', String(i)], alias]),
    ];
    for (const [path, alias] of refs) {
      if (!(alias in cfg.models)) ctx.addIssue({ code: 'custom', path, message: `unknown model "${alias}"` });
    }
  });

export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;
export type ProviderConfig = ModelsConfig['providers'][string];
export type ModelConfig = ModelsConfig['models'][string];
export type Pricing = ModelConfig['pricing'];

export function parseModelsConfig(yamlText: string): ModelsConfig {
  return ModelsConfigSchema.parse(parse(yamlText));
}

export async function loadModelsConfig(path: string): Promise<ModelsConfig> {
  return parseModelsConfig(await readFile(path, 'utf8'));
}
