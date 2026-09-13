---
sidebar_position: 2
---

# Quickstart

Ragen is self-hosted, so "getting started" means getting an instance running on
your own machine. One command scaffolds one, and the whole thing is local:
Postgres, Qdrant, the model gateway and the apps.

Budget about ten minutes, most of it Docker pulling images.

## What you need

- **Node.js 24.x.** The installer refuses to run on anything older, before it
  clones — the setup it runs for you (`npm install` across the monorepo,
  `prisma generate`, the migrations and the seed) runs under your Node and
  would otherwise leave a tree that fails much later, nowhere near the cause.
- **Docker** and Docker Compose, running.
- Roughly **8 GB of RAM** for the backing services.
- An **OpenAI or Anthropic API key**, if you want to chat straight away. You
  can also point Ragen at models on your own hardware instead — that is
  [Open models on your own hardware](/docs/open-models), and it is deployment
  work rather than a first step.

No GPU is needed unless you serve models locally.

## Step 1: Scaffold an installation

```bash
npx create-ragen-app my-ragen-app
```

The wizard clones the repository, generates every secret it safely can, asks
for a model provider key, asks how you want storage and encryption configured,
starts the backing services in Docker, and runs the first-time setup — the
Prisma client, the migrations and the seed.

It does not start the apps. That is the next step.

:::tip Flags
`--yes` accepts every default, `--provider=openai` takes the key from
`OPENAI_API_KEY` instead of prompting, and `--skip-docker` / `--skip-install`
stop before the steps you would rather run yourself. `--ref=<branch>` clones
something other than `main`.
:::

## Step 2: Start the apps

Two processes, in two terminals:

```bash
cd my-ragen-app
npm run api:dev      # apps/api  — http://localhost:3001
```

```bash
cd my-ragen-app
npm run web:dev      # apps/web  — http://localhost:3000
```

**`apps/api` is not optional.** The web app delegates thread creation, the
thread sidebar and notifications to it, so starting only the web app gets you a
panel that loads and a chat that cannot open a thread.

Add a third terminal if you want to upload documents:

```bash
cd my-ragen-app
npm run worker:dev   # apps/worker — document ingestion
```

The worker is what turns an uploaded file into searchable chunks. Without it an
upload returns `200`, the document sits in a pending state, and nothing in the
web app says why. It checks its own environment at boot and exits with the
missing variable named, rather than starting half-configured — the installer
writes what it needs.

The admin panel, if you want it, is `npm run admin:dev` on
[http://localhost:3200](http://localhost:3200) — see
[Admin panel](/docs/admin-panel).

## Step 3: Create the first account

Open [http://localhost:3000](http://localhost:3000). A fresh install sends you
to a page that creates the platform administrator: you choose the name, the
organization name and the password there. From then on that account creates
the others.

If something required is still unconfigured, that same screen lists it by
environment-variable name and says what breaks without it, rather than failing
with a stack trace. An unreachable database is reported the same way.

## Step 4: Ask a question of your own documents

1. Create a **project** — a self-contained knowledge base with its own
   documents and its own instructions.
2. Upload a document to it. Parsing happens asynchronously in the worker; the
   document's status tells you when it is searchable.
3. Ask a question in chat. The answer is grounded in what you uploaded, with
   citations back to the source.

## Verifying the install

```bash
curl http://localhost:3001/v1/healthcheck     # {"status":"ok"}
curl http://localhost:4000/v1/models          # models LiteLLM can actually reach
curl http://localhost:6333/collections        # Qdrant is up
```

If ingestion appears to hang, check the worker log first. Upload returns `200`
as soon as the file is stored — parsing happens afterwards, and a parsing
failure is only visible there and in the document's status.

## What's next?

- [**Self-hosting**](/docs/self-hosting) — the manual path, what each service
  is for, and the settings a production install must change (encryption,
  storage, the embedding model).
- [**API quickstart**](/docs/api-reference/quickstart) — your first call
  against the instance you just built, using the TypeScript SDK.
- [**Open models on your own hardware**](/docs/open-models) — serving models
  locally so no document-bearing call leaves your network.
- [**Concepts**](/docs/concepts) — projects, organizations, RAG, access control.
