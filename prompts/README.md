# Prompts

One directory per prompt role, one file per version: `prompts/<name>/<version>.md`.

- Versions are immutable. To change a prompt, add `v2.md` and point the code at it.
- The prompt version is stored with each cached page.
- Keep the stable prefix (system + profile + skeleton) first so provider prompt caching hits.
- Placeholders use `{{name}}`.
