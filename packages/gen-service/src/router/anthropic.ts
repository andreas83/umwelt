import Anthropic from '@anthropic-ai/sdk';
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

function normalizeStop(reason: string | null): string {
  if (reason === 'end_turn' || reason === 'stop_sequence') return 'end';
  return reason ?? 'unknown';
}
