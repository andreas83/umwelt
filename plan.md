# Project Plan — Umwelt

Personal art project. Possibly shared within the art scene, never as a product.

## Phase 0 — Setup & decisions
- [x] Pick the project name: **Umwelt** (after von Uexküll: the world as one creature perceives it)
- [x] Repo + pnpm workspace + TypeScript strict + Vitest
- [ ] `.env` handling, API keys for 3–4 providers _(`.env.example` + `--env-file` done; keys still to add)_
- [x] Decide: in-process gen service vs. local HTTP service → in-process (Electron main); `SourceStrategy` keeps it movable
- [x] Write the prompt template structure (`prompts/`, versioned)

## Phase 1 — Model bake-off (decides the default models)
- [x] Test set: 20 URLs (news, forum, shop, blog, wiki-style, search) × 4 contrasting profiles (`packages/eval/data/`)
- [x] Model router (Anthropic SDK + OpenAI-compatible clients) + `config/models.yaml`
- [x] Content JSON schema (zod): title, teaser, sections, links, image prompts
- [x] Measure per model: time to first token, tok/s, cost per page, JSON validity rate _(harness built)_
- [x] Measure refusal / softening rate per profile axis (political, religious, sexual orientation) _(LLM judge, `prompts/judge/v1.md`)_
- [x] Blind rating export (HTML gallery or CSV) for 2–3 raters
- [x] Candidates: Haiku 5.5, GPT-6 Luna, DeepSeek V4.1 Flash, Gemini 3.8 Flash, Sonnet 5.5, Mercury 2 (in catalog)
- [x] Anthropic runs: content/v1 baseline vs content/v2 (stronger slant), Haiku 5.5 + Sonnet 5.5, judge v2
- [ ] Other providers (keys needed), blind ratings from 2–3 raters
- [ ] Structured outputs for Anthropic (Haiku first-try JSON validity 74% on v2, mostly bracket errors)
- [ ] content/v4: say that balanced axes mean a neutral outlet (Haiku refused one neutral page on v2)
- [ ] judge/v3: fictional people may be quoted (all 6 "boundary violations" so far were false positives)
- [ ] Decision: default `planner` / `content` / `gallery` model documented in `config/models.yaml`

## Phase 2 — MVP (mode A, text only)
- [x] Electron shell: window, tabs, address bar, back/forward
- [x] `protocol.handle` interceptor for http/https, with no network access from the renderer (web session: JS off, non-http schemes cancelled; internal session: http(s) → 403)
- [x] Profile schema + local encrypted storage (safeStorage) + basic settings UI
- [x] Strategy A (PureGen)
- [x] Content generator → template renderer (single call; separate planner deferred until streaming in Phase 3)
- [x] Page cache keyed by `(url, profile_id, world_seed, mode)` (JSON files for now; SQLite with the world model in Phase 4)
- [x] Link rewriting: every link stored with a description and resolved on click
- [x] "Generated" indicator (default on)
- [x] Error template for failed generation

## Phase 3 — Consistency & speed
- [ ] Domain skeleton generation (CSS, header, footer, nav) + cache
- [ ] Streaming: skeleton renders immediately, content fills in progressively
- [ ] Prompt caching: stable prefix ordering verified with metrics
- [ ] Pre-generation of the top 3 likely links in the background
- [ ] Synthetic search engine (results pages with resolvable synthetic URLs)
- [ ] Metrics view (latency, tokens, cost per page / per session)

## Phase 4 — World model
- [ ] Entity/fact extraction after each generated page
- [ ] Fact store (SQLite + sqlite-vec) injected as context into new pages
- [ ] Global world date + current events list shared by all news-like sites
- [ ] "Refresh world" action (new `world_seed`)

## Phase 5 — Modes B & C
- [ ] Strategy C (StyleOnly): fetch the real site once, extract a style profile, cache it, then generate
- [ ] Strategy B (Rewrite): fetch the real DOM, strip scripts, mark text nodes, replace the text
- [ ] Mode selection: global / per domain / per tab
- [ ] Side-by-side view: same URL in A / B / C

## Phase 6 — Personalization
- [ ] Full profile UI: tone, reading level, language/region, interests, orientation axes, content filters
- [ ] Per-domain overrides
- [ ] Profile strength slider (0–100 %)
- [ ] Side-by-side view: same URL under two profiles
- [ ] Profile presets for exhibitions (e.g. "neutral", "bubble left", "bubble right")

## Phase 7 — Interactivity & media
- [ ] Form interception: search fields, comments, contact forms → generated responses
- [ ] Neutralize password / payment fields (values discarded)
- [ ] Image generation or placeholders, image cache
- [ ] Favicons per domain
- [ ] Video placeholders

## Phase 8 — Safeguards & art-scene release
- [ ] Screenshot watermark (default on)
- [ ] CSP + network kill switch verified by test (no outbound request from the renderer)
- [ ] Model-side content filter independent of the profile
- [ ] Generic rendering of real brand names / logos in shared builds
- [ ] "About this piece" page: what the browser is, that everything is generated
- [ ] Packaged builds (macOS / Windows) for sharing
- [ ] Optional: offline exhibition mode with a self-hosted model (SGLang / vLLM)

## Open questions
- [ ] Image model: generated images or placeholders by default?
- [ ] Can the indicator be switched off in shared builds? (Default plan: no)
- [ ] Exhibition format: installation, screen recording, or shared build?

