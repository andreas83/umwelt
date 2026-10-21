import { MissingApiKeyError, type ModelRouter } from '@umwelt/gen-service';

/** One tiny call per model: verifies keys, model ids and params before a paid run. */
export async function checkModels(router: ModelRouter, models: string[], log: (l: string) => void = console.log): Promise<boolean> {
  let allOk = true;
  for (const alias of models) {
    try {
      const r = await router.forModel(alias).complete({ system: 'Reply with the single word OK.', user: 'Ping.', maxTokens: 256 });
      log(`✓ ${alias.padEnd(22)} ${String(r.ttftMs ?? '–').padStart(5)}ms ttft  "${r.text.trim().slice(0, 20)}"  stop=${r.stopReason}`);
    } catch (e) {
      allOk = false;
      log(`✗ ${alias.padEnd(22)} ${e instanceof MissingApiKeyError ? e.message : (e as Error).message.split('\n')[0]}`);
    }
  }
  return allOk;
}
