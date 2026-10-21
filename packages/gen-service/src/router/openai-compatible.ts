import type OpenAI from 'openai';
import type { ModelConfig } from './config.js';
import { costUsd } from './cost.js';
import { StreamTimer } from './timer.js';
import type { CompletionRequest, CompletionResult, LlmClient } from './types.js';

export function openAICompatibleClient(alias: string, model: ModelConfig, client: OpenAI): LlmClient {
  return {
    alias,
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      const timer = new StreamTimer();
      const params = {
        ...model.params,
        model: model.model,
        [model.maxTokensParam]: req.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
      } as OpenAI.ChatCompletionCreateParamsStreaming;

      const stream = await client.chat.completions.create(params, req.signal ? { signal: req.signal } : {});
      let text = '';
      let finish: string | null = null;
      let usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
      let refusal = false;

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        const delta = choice?.delta;
        if (delta?.content) {
          timer.mark();
          text += delta.content;
          req.onText?.(delta.content);
        }
        if (delta?.refusal) refusal = true;
        if (choice?.finish_reason) finish = choice.finish_reason;
        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens,
            cachedInputTokens: chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens,
          };
        }
      }

      return {
        text,
        stopReason: refusal ? 'refusal' : normalizeStop(finish),
        usage,
        ttftMs: timer.ttftMs,
        totalMs: timer.totalMs(),
        costUsd: costUsd(usage, model.pricing),
      };
    },
  };
}

function normalizeStop(reason: string | null): string {
  if (reason === 'stop') return 'end';
  if (reason === 'length') return 'max_tokens';
  if (reason === 'content_filter') return 'refusal';
  return reason ?? 'unknown';
}
