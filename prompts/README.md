# Prompts

One directory per prompt role, one file per version: `prompts/<name>/<version>.md`.

- Versions are immutable. To change a prompt, add `v2.md` and point the code at it.
- The prompt version is stored with each cached page and each eval result.
- Text above the `=== user ===` line is the system prompt: the stable prefix (instructions + profile + skeleton),
  kept first so provider prompt caching hits. Text below it is the per-request user message.
- Placeholders use `{{name}}`; a missing variable throws.
