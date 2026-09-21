---
title: create-ragen-connector — scaffolding an MCP server Ragen can connect to
status: in-progress
areas: [connectors, admin, api]
adrs: [02, 32, 35, 38, 52]
---

# create-ragen-connector — scaffolding an MCP server Ragen can connect to

> **Primary implementation repository: `webamigos/ragen-connectors`.** This file
> lives here because the spec process does ([`README.md`](README.md)) and
> because the acceptance criterion is a scaffolded connector answering a real
> chat turn in `ragen-app`. Everything this changes in *this* repository is
> named in [Core surfaces touched](#core-surfaces-touched) — and it is a
> documentation line and one e2e test, nothing else.

## TLDR

[ADR-52](../adrs/52-the-connector-catalogue-is-data-not-an-enum.md) made the
Ragen half of adding a connector free: a platform administrator types a row at
`/mcp-catalogue`, clicks **Test connection**, and no deploy happens. The other
half did not move — the MCP server itself is still a hand-copy of
`services/clickup/` across a dozen files, two ports, a Dockerfile whose build
context is the monorepo root, and a boot order whose mistakes are silent.
`create-ragen-connector` scaffolds that half and prints the catalogue row's
values, so the two halves meet.

The non-obvious part is not the templating. It is that a connector author
cannot learn the wire contract from the MCP specification, because Ragen's
client departs from it in three places — `customer_id` arrives as a **tool
parameter** and not the `x-customer-id` header the core helper reads, tools must
return a `{success}` envelope rather than throw, and the catalogue URL must
carry `/mcp` or the connector will pass Test connection and then dial a
different address at tool-load time. The template's job is to encode those, and
its tests' job is to keep encoding them when the client changes.

## Problem

Adding an MCP server to a Ragen installation is now two unequal halves.

**The Ragen half costs minutes.** `/mcp-catalogue` → New entry → slug, label,
URL, auth type → Test connection → Save. ADR-52.

**The connector half costs a day and fails quietly.** The documented procedure
is `.claude/skills/connectors-add-service/SKILL.md` in `ragen-connectors`: copy
`services/clickup/`, rename it, then update *in lockstep* the port table in
`AGENTS.md`, the port table in `docs/architecture.md`, `index.ts`, the
Dockerfile's `EXPOSE`, `docker-compose.yml` and the Railway config. The skill
exists because these are the steps people get wrong, and it names what each
mistake looks like:

- A missed MCP port leaves a service whose health check passes and which is
  unusable; at the client it reads as "no tools", which looks like a client bug
  ([`fastmcp-owns-its-own-listener.md`](https://github.com/webamigos/ragen-connectors/blob/main/docs/lessons/fastmcp-owns-its-own-listener.md)).
- `OTEL_SERVICE_NAME` set with `process.env.X ??=` below the `instrument.js`
  import silently never applies, because ESM evaluates imports first
  ([`an-env-assignment-above-an-import-runs-after-it.md`](https://github.com/webamigos/ragen-connectors/blob/main/docs/lessons/an-env-assignment-above-an-import-runs-after-it.md)).
- A local import without the `.js` extension does not compile, and a
  `@ragen-connectors/core` import typechecks against `dist/`, not `src/`
  ([`services-typecheck-against-cores-dist-not-its-source.md`](https://github.com/webamigos/ragen-connectors/blob/main/docs/lessons/services-typecheck-against-cores-dist-not-its-source.md)).

A checklist is the weakest possible enforcement of a rule: nothing fails when
you skip a line. Four of the six lessons in that repository are the residue of
someone skipping one.

And there is a second audience the checklist does not serve at all. ADR-52's
Problem section names it:

> An internal MCP server — a company's own, on its own network — cannot be
> connected at all, at any price, without forking.

ADR-52 fixed the *connecting*. It left the company with no starting point for
the server, and no statement of what Ragen will send it. Today they would have
to read `apps/web/src/libs/mcp/client.ts` to find out.

## Out of scope

- **No changes to how a catalogue entry is created.** The scaffolder prints
  values; a human types them into `/mcp-catalogue`. An authenticated admin API
  that would let `--register` create the row is a second capability, in a
  different repository, with its own authorization story. Named as a follow-up,
  not built.
- **No new auth shapes.** The template offers the three
  `OPERATOR_CREATABLE_AUTH_TYPES` — `SERVER_SIDE`, `API_KEY_BEARER`,
  `EXTERNAL_MCP`. `API_KEY_CUSTOM_HEADER` assembles its URL from a shop address
  the *user* types, which ADR-52 keeps as code, and a scaffolder cannot generate
  a row nobody can create.
- **`@ragen-connectors/core` is not published to npm.** See
  [Why core is vendored](#why-core-is-vendored-and-not-published) — this is a
  decision, not a deferral.
- **No hosted registry, no marketplace, no plugin runtime.** ADR-38 is explicit
  that MCP is the extension API and nothing loads in-process; a scaffolder that
  produced anything but a separate service would contradict it.
- **Deployment is scaffolded, not performed.** The template writes a Dockerfile
  and a compose file. It does not create a Railway service — ADR-47 puts that
  configuration in the dashboard.
- **`apps/mcp` is untouched.** That is the reverse direction (ADR-36).

## Proposed solution

### One template body, two targets

`npx create-ragen-connector <name>` detects where it is and produces one of two
shapes from the same content:

| | **Workspace target** | **Standalone target** |
|---|---|---|
| Chosen when | cwd (or an ancestor) is the `ragen-connectors` root | anywhere else |
| Writes to | `services/<name>/` | `<name>/`, with `git init` |
| Shared code | `"@ragen-connectors/core": "*"` | `src/runtime/`, vendored |
| Ports | next free pair from the table, and **the table is updated** | `PORT` / `PORT + 1000`, defaults 8080/9080 |
| Also updates | `AGENTS.md` and `docs/architecture.md` port tables | nothing outside the new directory |
| Vault | available | absent — see below |

Detection is a real answer to a real fork: an internal connector *must* join the
workspace (turbo's graph, the shared lint config, the port table, one
`npm test`), and an external one must not require a checkout of a repository the
author has no reason to clone.

The two differ in exactly two generated files — `package.json` and
`src/runtime.ts`, a one-line re-export that points either at
`@ragen-connectors/core` or at `./runtime/index.js`. `src/index.ts`,
`src/tools/`, the tests, the Dockerfile and the README are byte-identical. That
is enforced, not hoped for: `templates-differ-only-where-they-must.test.ts`
renders both and asserts the set of differing paths.

Rejected: **two separate templates.** They would drift, and the drift would be
invisible until someone's standalone connector turned out to encode a contract
that changed a release ago.

### Why core is vendored, and not published

The standalone target needs four things from `@ragen-connectors/core`:
`validateEnvVars`, `logger`, `getCustomerId` and the OTEL `instrument` module.
It must **not** have the fifth, `ragenVaultClient` — that is an HMAC-signed
contract with ragen-token-vault, keyed by a per-service shared secret
(ADR-02/ADR-32), and a third party connecting their own MCP server has no vault
and no secret. Publishing core would put it on their disk anyway.

So the standalone target vendors ~120 lines into `src/runtime/` with a header
saying where they came from. Publishing core was rejected for three reasons, in
descending order of weight:

1. It would publish the vault client to npm — a client for an internal service,
   whose surface is a cross-repo contract that `ragen-connectors`'s own
   `AGENTS.md` says needs a two-sided rollout to change. A published package
   makes that rollout unbounded.
2. It makes every internal refactor of core a semver decision.
3. `npm view @ragen-connectors/core` is a 404 today and nothing depends on that
   changing.

The cost is honest and worth stating: a vendored copy does not get fixes. The
mitigation is that it is version-stamped, `create-ragen-connector` prints the
stamp, and the vendored files' only job is boot-time plumbing that has not
changed in the repository's lifetime.

### What the template encodes, and why a template is the right place

The generated `src/tools/example-tools.ts` is not filler. It is the wire
contract, in compilable form, with a test beside it:

**`customer_id` is a tool parameter, not a header.** `wrapToolsForConnector`
in `apps/web/src/libs/mcp/client.ts` strips `customer_id` from the schema the
model sees and injects the connector's own value into every call:

```ts
cleaned.customer_id = customerId;   // apps/web/src/libs/mcp/client.ts
```

The `x-customer-id` header is sent too, but **only for `server_side`** — an
`api_key_bearer` connector gets `Authorization` and no customer header at all.
So `getCustomerId(headers)`, which core exports and which reads that header, is
the wrong thing to reach for and every existing service correctly ignores it.
A connector author reading core's exports would reach for it first. The
template takes the parameter, and its test asserts a call with no header still
works.

**A tool returns an envelope and never throws** (ADR-03 in
`ragen-connectors`). A throw reaches the model as an opaque protocol error it
cannot act on. The generated tool has the `try`/`catch` and the generated test
covers the `{success: false}` branch, because that is the branch that ships.

**The catalogue URL must end in `/mcp`.** This one is a trap with teeth.
`createConnectorCommand` appends `/mcp` to the row's URL when storing the
connector, but `resolveMcpServerUrl` dials the row's URL *verbatim* at
tool-load time. Type `http://10.0.0.5:9080` and the two disagree: the stored
connector is right and the address actually dialled is wrong. **Test connection
catches it** — it probes the typed URL, and FastMCP serves only `/mcp` — which
is why this is a documentation problem rather than a defect to fix here. The
generated README prints the URL *with* the suffix and says to paste that exact
string.

**`allowsPrivateAddress` does not admit `localhost`.** `classifyIpv4` returns
`loopback` for `127.0.0.0/8`, and the opt-out admits `private` only. A
connector and a Ragen on the same host, both outside containers, cannot be
joined through the catalogue — the operator must use the host's RFC 1918 address
(`192.168.x.x`), or run both in one compose network where Docker's DNS gives a
`172.16/12` address. The generated README says so, because the failure message
("That address is private or reserved") sounds like the flag is the fix, and it
is not. This is a real rough edge in ADR-52's work; see
[Follow-ups](#follow-ups).

### The catalogue handoff

On success the scaffolder writes `ragen-connector.json` beside the service and
prints the same values:

```json
{
  "$schema": "https://docs.ragen.ai/schemas/ragen-connector-v1.json",
  "slug": "weather",
  "label": "Weather",
  "description": "Current conditions and forecasts.",
  "lucideIcon": "cloud-sun",
  "authType": "SERVER_SIDE",
  "scopes": [],
  "mcpServerUrl": "http://localhost:9080/mcp",
  "generatedBy": "create-ragen-connector@0.1.0"
}
```

`slug` is validated at generation time with the *same* rule the admin form
applies — `^[a-z][a-z0-9-]*$`, ≤64 characters — which is
`catalogSlugError()` in `@ragenai/platform-contracts`. The scaffolder cannot
import that package (different repository, no dependency), so it carries the
pattern with a comment naming the source, and
`slug-rule-matches-the-catalogue.test.ts` in *this* repository asserts the two
agree. A slug refused by the form after the service is written, named, built and
containerised is the single most annoying failure this file can prevent, and it
costs one regex to prevent.

`mcpServerUrl` is emitted as the local development URL, with the `/mcp` suffix,
and the README says to replace the host before pasting it into a deployed
installation.

Rejected: **emitting SQL**, or a seed row. It would bypass the admin form's
validation, its audit entry and its address check — three things ADR-52 put
there deliberately.

### What the CLI asks

Seven questions, each with a default, all answerable by flags so CI can run it:

| Prompt | Flag | Default |
|---|---|---|
| Name | positional | prompt |
| Slug | `--slug=` | name, kebab-cased |
| Description | `--description=` | `""` |
| Auth shape | `--auth=` | `server_side` |
| HTTP port | `--port=` | next free in the workspace, else 8080 |
| Lucide icon | `--icon=` | `plug` |
| Install dependencies | `--skip-install` | yes |

`--yes` accepts every default, as `create-ragen-app` does. Unknown flag values
are rejected rather than ignored, for the reason `create-ragen-app`'s
`args.ts` already gives: silently falling back to "ask me" turns a typo in a CI
job into a hang on a prompt nothing can answer.

## Core surfaces touched

In **`ragen-app`** (this repository) — near-nothing, which is the point of
ADR-52 having landed first:

| Surface | Change | What catches a mistake |
|---|---|---|
| `prisma/schema.prisma` | **none** | — |
| `packages/platform-contracts` | **none**; its slug rule is *read* by a new test | `slug-rule-matches-the-catalogue.test.ts` |
| `packages/connector-guard` | **none** | — |
| `docs/mcp-integrations.md` | one paragraph pointing at the scaffolder | review |
| `apps/web/e2e/` | one `p0` test: a catalogue entry against a stub MCP server serves a tool to a chat turn | it is the gate — see [Testing](#testing) |

In **`ragen-connectors`** (the implementation):

| Surface | Change | What catches a mistake |
|---|---|---|
| `packages/create-ragen-connector` (new) | the CLI and both templates | its own Vitest suite, in the root run |
| `packages/core` | **none** — vendored files are copies, and a test asserts they are byte-identical to their sources | `vendored-runtime-is-current.test.ts` |
| `AGENTS.md`, `docs/architecture.md` | the port tables become *generated-into* rather than hand-edited | `port-table-is-consistent.test.ts` |
| `.claude/skills/connectors-add-service` | rewritten to say "run the scaffolder", keeping the decision content (credential model, ADR-04) that a template cannot make | review |
| `services/<demo>` (new) | the end-to-end proof, generated by the scaffolder and committed | root `npm test`, plus the `p0` above |

## Data model

**None.** No migration in either repository. The catalogue table
`McpCatalogEntry` already exists and this work writes to it only through the
admin form, by hand.

`ragen-connector.json` is a new file format, versioned by its `$schema` key
from the first release so that a future `--register` has something to send.

## Failure modes

- **The target directory exists and is not empty.** Refuse, name the directory,
  write nothing. Half-scaffolding into someone's project is unrecoverable
  without git, and a standalone target has no git yet.
- **The chosen port is taken in the workspace table.** Refuse with the next free
  pair named. Allocating it anyway produces the exact silent failure
  `fastmcp-owns-its-own-listener.md` documents.
- **The port is free in the table but occupied on the machine.** Not detectable
  at scaffold time and not worth pretending — the generated `npm run dev` fails
  loudly with `EADDRINUSE`, which is the correct outcome.
- **The slug is invalid, or is one of the eleven legacy UPPERCASE built-ins.**
  Refuse at generation time with the form's own message. A slug colliding with a
  built-in case-insensitively would send two connectors the same
  `x-customer-id`, which is the hazard ADR-52's unique index on `lower(slug)`
  exists to stop.
- **`npm install` fails** (offline, registry down). The scaffold is already
  written and is the valuable part: report the failure, print the install
  command, exit non-zero. Do not roll back files the user can use.
- **The operator pastes a URL without `/mcp`.** Test connection fails against
  the typed URL. The generated README pre-empts it; the failure is loud.
- **The operator's MCP server is on `localhost`.** The catalogue form refuses
  it and says "private or reserved". Covered in the README; see Follow-ups.
- **Ragen's wire contract changes.** The template's contract tests keep passing
  — they test the template against *its own* assertion of the contract. This is
  the one failure mode the scaffolder cannot catch itself, and it is why the
  `p0` e2e test in `ragen-app` exists: it runs a generated-shaped stub server
  against the real client.

## Phases

Each phase leaves both repositories working.

### Phase A — the CLI, with one target

- [x] **A1.** `packages/create-ragen-connector` with `args.ts` + tests: flag
      parsing, slug validation against the catalogue's rule, refusal messages.
      No file writing yet. Runs in the root `npm test`.
- [x] **A2.** Workspace detection and port allocation, as pure functions over a
      parsed port table. Tested against the real `AGENTS.md`.
- [x] **A3.** The workspace target renders: `services/<name>/` with `index.ts`,
      one example tool, `__tests__`, `.env.example`, `Dockerfile`,
      `docker-compose.yml`, `tsconfig*.json`, `README.md`. Both port tables
      updated. Verified by generating into a temp dir and running the
      repository's own gate over it.
- [x] **A4.** `ragen-connector.json` and the printed summary.

### Phase B — the second target

- [x] **B1.** `src/runtime/` vendored from core, with
      `vendored-runtime-is-current.test.ts` asserting the copies match their
      sources byte for byte.
- [x] **B2.** The standalone target renders, including `git init` and a
      Dockerfile whose build context is the project itself rather than a
      monorepo root.
- [x] **B3.** `templates-differ-only-where-they-must.test.ts`.

### Phase C — the proof

- [x] **C1.** Generate the demo connector with the scaffolder — no hand-editing
      of anything the template wrote — and commit it as
      `services/<demo>`. Two tools over a keyless public API, `server_side`.
- [ ] **C2.** Run it, add it to a local Ragen through `/mcp-catalogue` with the
      RFC 1918 address, connect it, and get a chat turn that calls a tool.
      **Blocked on the finding below**, and on a local constraint:
      Ragen's own `probeMcpServer` lists both of the generated connector's
      tools, and the runtime transport then refuses the same URL because it is
      `http://`. Separately, this machine resets inbound connections on its own
      LAN address (macOS local-network privacy), so the RFC 1918 route needs
      both apps containerised here.
- [ ] **C3.** `p0` e2e in `ragen-app`: a catalogue entry pointed at a stub MCP
      server in-process, connected, and a chat turn that resolves its tool.
      This is the regression gate for the wire contract.

### Phase D — replace the checklist

- [x] **D1.** Rewrite `.claude/skills/connectors-add-service` around the
      scaffolder, keeping what a template cannot decide (the credential model,
      ADR-04's obligations when per-customer auth is impossible).
- [x] **D2.** `docs/mcp-integrations.md` in this repository gains the paragraph
      linking the two halves.
- [ ] **D3.** Publish `create-ragen-connector@0.1.0`. The name is free on npm.

## Testing

Per the Testing Requirements in `AGENTS.md`, and with the level named:

- **Unit** (`ragen-connectors`, root Vitest): arg parsing, slug rule, port
  allocation, port-table rewriting, template rendering, the two
  cross-checking tests (`vendored-runtime-is-current`,
  `templates-differ-only-where-they-must`).
- **Integration** (`ragen-connectors`): generate both targets into a temp
  directory and run `lint && typecheck && test` over the result. A scaffolder
  whose output does not pass the gate of the repository it writes into is
  worse than no scaffolder, and nothing short of running it proves otherwise.
- **Unit** (`ragen-app`): `slug-rule-matches-the-catalogue.test.ts` — the
  scaffolder's regex against `CATALOG_SLUG_PATTERN`. It lives here because this
  is where the rule can change.
- **e2e** (`ragen-app`, `p0-*`): the wire contract, end to end. It must be
  `p0` and not `p1`–`p3`: a PR runs only `smoke-*` and `p0-*`, so anything
  lower would not gate the change that breaks it.
- **Manual, once**: C2. A local Ragen, a real browser, a real chat turn. The
  e2e test is a stub by construction; this is the only step that proves a
  process started by the generated `npm run dev` is reachable by the real
  client over a real socket.

## Rollout and rollback

No migration and no feature flag, in either repository: nothing existing reads
anything this adds. The generated demo connector is a new workspace that
nothing imports.

Rollback is `git revert` plus `npm unpublish` (or, past npm's 72-hour window,
`npm deprecate`) for the CLI. Connectors already generated keep working — they
are ordinary services with no runtime dependency on the scaffolder, which is a
property of generating code rather than providing a framework, and one more
reason ADR-38's "no in-process plugin runtime" is the right frame for this.

## Follow-ups

Not in this spec; recorded because it found them.

- **A self-hosted Ragen cannot connect an MCP server on its own host** unless
  both are containerised. `allowsPrivateAddress` admits RFC 1918 and refuses
  loopback — deliberately, and the reasoning about cloud metadata on
  `169.254.169.254` is sound — but "Ragen and one MCP server on one VM, no
  Docker" is a normal small installation and it has no route through the form.
  A `RAGEN_TRUSTED_MCP_HOSTS` allowlist read from the environment would fit the
  existing exemption for deployer-controlled addresses. Needs its own spec.
- **`--register`**, once an authenticated admin API for catalogue entries
  exists in `ragen-app`.
- **A row's URL and the connector's stored URL disagree by `/mcp`** when an
  operator omits the suffix. Test connection catches it, so it is a usability
  defect rather than a live bug; normalising the suffix in one place would close
  it.
- **An `http://` catalogue entry passes Test connection and can never load a
  tool.** Found by C2, and the most serious of the three. `createGuardedConnector`
  defaults `allowedProtocols` to `['https:']`; `probeMcpServer` overrides it with
  `[parsed.protocol]` and says so in a comment about internal servers that
  legitimately have no certificate; the three runtime call sites
  (`apps/web/src/libs/mcp/client.ts:400`, `apps/api/src/mcp/client.ts:393`,
  `apps/api/src/connectors/connectors.service.ts:493`) pass nothing. So the form
  accepts `http://`, Test connection reports `{ok: true}` and names the tools,
  and every tool load then fails with
  `InsecureProtocolError: only https is allowed`. Measured at one address with
  the address policy held constant, so the scheme is the only variable.

  That is this button's purpose exactly inverted — it exists so an operator can
  tell a working endpoint from a typo before a customer does.

  Two legitimate resolutions, and it is a product decision which:
  **(a)** thread the entry's own scheme to the runtime call sites as the probe
  already does — `['http:', 'https:']` for an http entry, `['https:']` for an
  https one, so a redirect still cannot downgrade; or **(b)** require https of
  operator-created entries, and make the form and the probe refuse `http://`
  rather than accept it. What cannot stand is the two halves disagreeing.
