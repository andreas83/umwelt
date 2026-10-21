# CLAUDE.md — Umwelt

## What this is
A desktop browser in which every page looks like a normal website, but all content is AI-generated.
The generated world is shaped by a user profile: tone, interests, and political, religious and sexual orientation.

**Context:** a personal art project. It may be shown or shared within the art scene. It is **never a commercial product**.
Users always know the pages are generated.

## Non-goals
- No production-grade browser (no extensions, sync, accounts, multi-user).
- No real-site JavaScript execution.
- No deception of uninformed users. No public hosting of generated pages under real domains.

## Invariants (do not break)
1. **No outbound traffic from generated pages.** All http/https requests from the renderer are intercepted.
   Only the generation service may reach the network: LLM APIs, plus real-site fetches in modes B and C.
2. **Form input never leaves the machine.** Password and payment fields are neutralized; their values are discarded, not logged.
3. **The profile is local-only.** It is stored encrypted and never written to logs, prompts dumps or telemetry.
   Prompts sent to the LLM APIs are the only exception.
4. **"Generated" indicator and screenshot watermark are ON by default.** Turning them off is allowed only in local builds, via an explicit setting.
5. **Determinism.** The same `(url, profile_id, world_seed, mode)` returns the cached page.
   A page is regenerated only on explicit "refresh world".
6. **The model never writes full HTML.** It outputs structured content (JSON) and the template renderer builds the HTML.
   Domain skeletons (CSS, header, footer, nav) are generated once per domain and cached.

## Architecture
```
apps/shell            Electron + TypeScript. Tabs, address bar, settings UI, protocol.handle interceptor
packages/gen-service  Generation pipeline (in-process at first; may become a local HTTP service)
  ├─ strategies/      Source strategies: A PureGen | B Rewrite | C StyleOnly (common interface)
  ├─ planner/         Page plan: title, sections, outgoing links + link descriptions
  ├─ generator/       Content generation, streamed JSON
  ├─ skeleton/        Domain skeleton generation + cache
  ├─ renderer/        Templates: JSON → HTML, link rewriting, sanitizing
  ├─ assets/          Images (image model or placeholders), favicons
  ├─ world/           World state: SQLite (pages, links, entities, facts), world date, events
  └─ router/          Model router: Anthropic via official SDK, others via OpenAI-compatible client; per-role config
packages/profile      Profile schema (zod), storage, encryption, per-domain overrides, strength slider
packages/eval         Model bake-off harness: test set, metrics, blind rating export
```

### Source strategy interface
```ts
interface SourceStrategy {
  id: 'A' | 'B' | 'C';
  resolve(url: URL, profile: Profile, world: WorldState): Promise<PageInput>;
}
```
The mode is selected per global setting, per domain, or per tab. Everything downstream of `resolve()` is mode-agnostic.

### Model roles (configured in `config/models.yaml`)
- `planner`: small and fast (e.g. Haiku 5.5 / GPT-6 Luna class)
- `content`: default is the same as the planner; `gallery` mode uses a higher-quality model
- `skeleton`: runs once per domain, quality over speed
- `image`: optional

Models are swappable by config only. No provider-specific code outside `router/`.
`config/models.yaml` has three parts: `providers` (kind + key env var), `models` (catalog alias → provider model id,
pricing, pass-through `params`), and `roles` (role → alias). The `judge` role scores profile adherence in the eval.

## Tech stack
- TypeScript (strict), pnpm workspaces, Node LTS
- Electron (renderer sandboxed, `contextIsolation: true`, no `nodeIntegration`)
- SQLite (better-sqlite3), sqlite-vec for entity similarity
- zod for all schemas (profile, page plan, content JSON)
- Vitest for tests

## Conventions
- All LLM output is validated with zod. On a validation failure, retry once and then fall back to the error template. Never render raw model output.
- Every prompt template lives in `prompts/` as a versioned file. The prompt version is stored with each cached page.
- Log latency (time to first token, total), tokens and cost for every LLM call to `world/metrics`.
- Keep the stable prompt prefix (system + profile + skeleton) at the start of the prompt for prompt caching.
- No secrets in the repo. API keys go in `.env` (git-ignored).

## Commands
Node 24 (`nvm use`), pnpm 10 via corepack.
- `pnpm build` / `pnpm typecheck` — `tsc -b` over all project references
- `pnpm test` — Vitest; resolves workspace packages to `src/` via the `source` export condition, no build needed
- `pnpm dev` — build, then launch the Electron shell
- `pnpm eval <check|run|judge|report|gallery>` — model bake-off (reads `.env`). `pnpm eval --help` for options.
  `run` prints a cost estimate and only spends money with `--yes`. Runs land in `data/eval/<run-id>/` and are resumable.

Workspace packages are named `@umwelt/*`. Ubuntu 24.04+: Electron's `chrome-sandbox` must be root-owned with mode 4755
(or allow unprivileged user namespaces); never ship `--no-sandbox`.

## Status
See `plan.md`.
