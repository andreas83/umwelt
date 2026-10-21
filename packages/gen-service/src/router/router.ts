import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { anthropicClient } from './anthropic.js';
import type { ModelsConfig, Role } from './config.js';
import { openAICompatibleClient } from './openai-compatible.js';
import type { LlmClient } from './types.js';

export class MissingApiKeyError extends Error {
  constructor(readonly alias: string, readonly envVar: string) {
    super(`model "${alias}" needs ${envVar} (set it in .env)`);
  }
}

export class ModelRouter {
  private readonly cache = new Map<string, LlmClient>();

  constructor(
    readonly config: ModelsConfig,
    private readonly env: Record<string, string | undefined> = process.env,
  ) {}

  forRole(role: Role): LlmClient {
    const alias = this.config.roles[role];
    if (!alias) throw new Error(`no model configured for role "${role}"`);
    return this.forModel(alias);
  }

  forModel(alias: string): LlmClient {
    const cached = this.cache.get(alias);
    if (cached) return cached;

    const model = this.config.models[alias];
    if (!model) throw new Error(`unknown model "${alias}"`);
    const provider = this.config.providers[model.provider];
    if (!provider) throw new Error(`unknown provider "${model.provider}"`);
    const apiKey = this.env[provider.apiKeyEnv];
    if (!apiKey) throw new MissingApiKeyError(alias, provider.apiKeyEnv);

    const client =
      provider.kind === 'anthropic'
        ? anthropicClient(alias, model, new Anthropic({ apiKey, ...(provider.baseUrl ? { baseURL: provider.baseUrl } : {}) }))
        : openAICompatibleClient(alias, model, new OpenAI({ apiKey, baseURL: provider.baseUrl }));
    this.cache.set(alias, client);
    return client;
  }
}
