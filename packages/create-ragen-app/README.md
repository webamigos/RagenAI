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

## Keep this in sync with the app

This package is the only thing that exercises the first-run path, and it is
*not* run by CI — a change that quietly breaks it surfaces as a stranger's
failed install. `AGENTS.md`'s Post-Task Workflow asks for an update here in
the same PR, and for the PR description to say so.

What counts as install-affecting:

| Change | What to update here |
| --- | --- |
| A new or renamed env var that a fresh install must set | `src/manifest.ts` (generated secret or corrected default) |
| A default model, embedding model or `VECTOR_SIZE` change | `src/llm-provider.ts` — and the two must stay consistent, or Qdrant rejects every upsert |
| An app the web app can no longer run without | the outro in `src/cli.ts`, which tells people what to start |
| A new first-run step (migration, seed, generate) | `src/tasks.ts` and `maybeRunFirstTimeSetup` |
| A `docker-compose.yml` service, port or name change | `src/tasks.ts`, and the collision check in `ragenStackVolumeExists` |
| A gate that a brand-new install cannot pass (registration, licensing, onboarding) | usually the app, not this package — a fresh install must be able to reach a working chat without an administrator who does not exist yet |

`tests/architecture/create-ragen-app-manifest-is-current.test.ts` catches one
direction only: a key this package writes that the `.env.example` no longer
has. The opposite drift — a new required var nobody taught the manifest
about — has no textual signal, which is why the rule above is a rule.

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

## Declining to paste a key

Typing a provider API key into someone else's CLI is a reasonable thing to
refuse, so the provider step is skippable — pick *"I'll configure LiteLLM
myself"*, or press enter on an empty key. The install still completes, and
`SETUP-LLM.md` is written into the new directory with the exact `.env.local`
values and `model_list` entries for OpenAI and Anthropic, plus the one
ordering constraint that matters (`VECTOR_SIZE` has to be right *before* the
first document is indexed). `src/manual-setup.ts` generates that file from
`LLM_PROVIDERS`, so it cannot drift from what the wizard would have done.

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
