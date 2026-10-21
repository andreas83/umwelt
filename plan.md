# Project Plan — Umwelt

Personal art project. Possibly shared within the art scene, never as a product.

## Phase 0 — Setup & decisions
- [x] Pick the project name: **Umwelt** (after von Uexküll: the world as one creature perceives it)
- [x] Repo + pnpm workspace + TypeScript strict + Vitest
- [ ] `.env` handling, API keys for 3–4 providers _(`.env.example` + `--env-file` done; keys still to add)_
- [ ] Decide: in-process gen service vs. local HTTP service
- [x] Write the prompt template structure (`prompts/`, versioned)

## Phase 1 — Model bake-off (decides the default models)
- [ ] Test set: 20 URLs (news, forum, shop, blog, wiki-style, search) × 4 contrasting profiles
- [ ] Model router with OpenAI-compatible clients + `config/models.yaml`
- [ ] Content JSON schema (zod): title, teaser, sections, links, image prompts
- [ ] Measure per model: time to first token, tok/s, cost per page, JSON validity rate
- [ ] Measure refusal / softening rate per profile axis (political, religious, sexual orientation)
- [ ] Blind rating export (HTML gallery or CSV) for 2–3 raters
- [ ] Candidates: Haiku 5.5, GPT-6 Luna, DeepSeek V4.1 Flash, Gemini 3.8 Flash, Sonnet 5.5, Mercury 2
- [ ] Decision: default `planner` / `content` / `gallery` model documented in `config/models.yaml`

## Phase 2 — MVP (mode A, text only)
- [ ] Electron shell: window, tabs, address bar, back/forward
- [ ] `protocol.handle` interceptor for http/https, with no network access from the renderer
- [ ] Profile schema + local encrypted storage + basic settings UI
- [ ] Strategy A (PureGen)
- [ ] Planner → content generator → template renderer
- [ ] Page cache keyed by `(url, profile_id, world_seed, mode)`
- [ ] Link rewriting: every link stored with a description and resolved on click
- [ ] "Generated" indicator (default on)
- [ ] Error template for failed generation

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

