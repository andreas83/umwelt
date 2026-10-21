import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import type { ModelConfig } from './config.js';
import { costUsd } from './cost.js';
import { StreamTimer } from './timer.js';
import type { CompletionRequest, CompletionResult, LlmClient } from './types.js';

export function anthropicClient(alias: string, model: ModelConfig, client: Anthropic): LlmClient {
  return {
    alias,
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      const timer = new StreamTimer();
      const params = {
        ...model.params,
        ...(model.structuredOutput && req.responseSchema ? outputConfig(model.params, req.responseSchema) : {}),
        model: model.model,
        max_tokens: req.maxTokens,
        system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: req.user }],
      } as Anthropic.MessageStreamParams;

      const stream = client.messages.stream(params, req.signal ? { signal: req.signal } : {});
      stream.on('text', (delta) => {
        timer.mark();
        req.onText?.(delta);
      });
      const msg = await stream.finalMessage();

      const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      const cached = msg.usage.cache_read_input_tokens ?? 0;
      const usage = {
        inputTokens: msg.usage.input_tokens + cached + (msg.usage.cache_creation_input_tokens ?? 0),
        cachedInputTokens: cached,
        outputTokens: msg.usage.output_tokens,
      };
      return {
        text,
        stopReason: normalizeStop(msg.stop_reason),
        usage,
        ttftMs: timer.ttftMs,
        totalMs: timer.totalMs(),
        costUsd: costUsd(usage, model.pricing),
      };
    },
  };
}

/** Merges the JSON-schema format into any configured `output_config` (e.g. effort). */
function outputConfig(params: Record<string, unknown>, schema: z.ZodType): { output_config: Record<string, unknown> } {
  // Only type + schema: our own zod validation decides validity, so the SDK's auto-parse must not throw first.
  const { type, schema: jsonSchema } = zodOutputFormat(schema);
  return { output_config: { ...(params.output_config as Record<string, unknown> | undefined), format: { type, schema: jsonSchema } } };
}

function normalizeStop(reason: string | null): string {
  if (reason === 'end_turn' || reason === 'stop_sequence') return 'end';
  return reason ?? 'unknown';
}
