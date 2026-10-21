# Umwelt

A desktop browser in which every page looks like a normal website, but all content is AI-generated —
shaped by a user profile (tone, interests, political, religious and sexual orientation).

Named after Jakob von Uexküll's *Umwelt*: the world as one particular creature perceives it.

A personal art project. Never a commercial product. Viewers always know the pages are generated.

## Development
Requires Node 24 and pnpm 10 (via corepack).

```sh
nvm use
corepack enable
pnpm install
cp .env.example .env   # add API keys
pnpm test
pnpm dev
```

See `claude.md` for architecture and invariants, `plan.md` for status.
