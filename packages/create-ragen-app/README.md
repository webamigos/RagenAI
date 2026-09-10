# create-ragen-app

Scaffolds a self-hosted [Ragen AI](https://github.com/webamigos/RagenAI)
installation with one command.

```bash
npx create-ragen-app my-ragen-app
```

It clones the repo, generates every secret it safely can, lets you paste a
plain OpenAI or Anthropic API key instead of configuring an enterprise model
provider, starts the backing services (Postgres, Qdrant, Temporal, LiteLLM,
Redis, …) in Docker, and runs the app's own first-run setup (Prisma client,
migrations, seed data) — leaving `cd my-ragen-app && npm run web:dev` as the
only remaining step.

## Flags

| Flag              | Effect                                             |
| ----------------- | --------------------------------------------------- |
| `--ref=<branch>`  | Clone a branch/tag other than `main`                 |
| `--skip-docker`   | Write the `.env.local` files but don't start Docker  |
| `--skip-install`  | Skip `npm install` / Prisma / seed                   |
| `--yes`           | Accept every default without prompting               |

Anything the wizard doesn't ask about (S3 storage, encryption at rest,
Stripe, email, MCP connectors) ships exactly as documented in the repo's own
`.env.example` files — see
[docs/self-hosting](https://docs.ragen.ai/docs/self-hosting).

## What it changes, and how it decides

`src/manifest.ts` is the single list of which env vars get a generated
secret or a corrected local-dev default, and which files receive them. It is
deliberately an *overrides* list — anything not in it is left exactly as the
cloned repo's own `.env.example` already has it. See the file's own comments
for the sharing rules (some secrets are the same value in two files, most are
independent).

## Publishing (manual for now)

There is no CI job wired up yet (see the project plan's non-goals). To cut a
new version:

```bash
npm version <patch|minor|major> --workspace=create-ragen-app
npm run build --workspace=create-ragen-app
npm publish --workspace=create-ragen-app
```
