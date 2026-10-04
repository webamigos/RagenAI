# ragen-cli

The command line for [Ragen AI](https://docs.ragen.ai) — a self-hosted RAG chat
platform with document knowledge bases, an in-process model gateway and a
public API.

```bash
npx ragen-cli@latest help     # no install
npm install -g ragen-cli      # or install it, then just `ragen`
```

Reach for `npx` for a one-off `create`. Install it globally when you work with
an installation from the terminal — `kb`, `search`, `brain` — and expect to
upgrade it yourself, because a global CLI goes stale without saying so.

## The package is `ragen-cli`; the command is `ragen`

npm refuses the unscoped name `ragen` — its similarity filter reads it as too
close to the existing `raven` and `hygen`, and returns 403 to anyone who tries,
not just to us. `bin` is independent of `name`, so the command you type is
unaffected.

The split only bites with `npx`, which resolves a **package**: `npx ragen-cli`
works, `npx ragen` looks for a package that does not exist. (It may appear to
work on a machine that already has the CLI installed globally — npx runs a
binary it finds on `PATH` before it fetches anything.)

## What works today

```
ragen create [dir]   scaffold a self-hosted Ragen installation
ragen kb <cmd>       knowledge base files: ls, upload, status, rm
ragen search <q>     the passages chat would answer from, without an answer
ragen login          check an API key and save it with the API address
ragen logout         forget them
ragen doctor         check this terminal can reach an installation
ragen brain <cmd>    Ragen Brain: next, doctor, findings, pages, graph, query, export
ragen help
ragen version
```

Every command except `create` talks to an installation's public API, with an
API key created under **Organization → API keys**. Save both once:

```bash
ragen login --url https://api.example.com      # asks for the key, hidden
echo "$KEY" | ragen login --url https://api.example.com   # or piped
```

or set them per shell, which wins over what is saved — as `--url` and
`--api-key` win over both:

```bash
export RAGEN_API_URL=https://api.example.com
export RAGEN_API_KEY=sk-...
```

### `ragen login`, `ragen logout`

There is no identity endpoint to sign in against, and none is needed: a key
already names its organization and scope. `login` asks `GET /v1/models` —
which any key may call — and saves the address and key only if the key is
accepted, so a typo never becomes every later command's "The API key was
refused". A `/v1` at the end of the address is dropped; the CLI adds it.

The key is kept **as plain text** in `$XDG_CONFIG_HOME/ragen/config.json`
(`~/.config/ragen/config.json` by default, `%APPDATA%\ragen\config.json` on
Windows), readable only by you — the same trade `gh`, `npm` and `docker` make
without a keychain. `ragen logout` deletes it. The key is read from a hidden
prompt or stdin rather than an argument by default, because arguments land in
shell history; `--api-key` still works. Over plain `http` to anything but
localhost, `login` warns that the key travels unencrypted.

### `ragen doctor`

Checks the path from this terminal to an installation, and exits non-zero if
any check fails:

```
ok    node       v24.15.0
ok    cli        ragen-cli 0.3.0
ok    url        https://api.example.com (from ~/.config/ragen/config.json)
ok    key        sk-749…sgF8 (from RAGEN_API_KEY)
ok    api        answers
ok    auth       the key is accepted
ok    models     gpt-oss-120b, mistral-small-3.2
-     brain      off for the organization, or the key's user is not an owner or admin
```

It says where the address and key came from — flag, variable or saved file —
which is most of what goes wrong when two of them disagree. `api` asks the
unauthenticated health check first, so "nothing answers here" (or "that is the
panel's address, not the API's") is told apart from "the key is refused".

`doctor` is about this client. Whether an installation is configured well —
its environment, its model routes, its queue — is answered on the host, by the
setup page and `npm run gateway:preflight`.

`ragen create` delegates to
[`create-ragen-app`](https://www.npmjs.com/package/create-ragen-app) and
forwards its arguments unchanged, so this is equivalent:

```bash
npx --yes create-ragen-app@latest ./my-ragen --skip-docker
ragen create ./my-ragen --skip-docker
```

`--yes` and `@latest` are what `ragen create` passes, so the two lines above run
the same version without a confirmation prompt. A bare `npx create-ragen-app`
may reuse whatever copy npx has cached.

The scaffolder stays the scaffolder. It is the only thing exercising the
first-run path, CI runs it on every pull request, and a second copy of that
wizard living here would drift from the environment manifest without anything
noticing.

### `ragen kb`

The knowledge base's files, over `/v1/files`:

```bash
ragen kb ls                          # newest 20; --limit <n>, --all for every page
ragen kb upload docs/*.pdf --wait    # upload, then wait until each is indexed
ragen kb status file-… --wait        # where a file is: uploaded, processed, error
ragen kb rm file-…                   # delete a file and its chunks
```

**The key decides where files go.** A key scoped to the whole knowledge base
uploads to, and lists, the files that belong to no assistant; a key scoped to
an assistant works on that assistant's files. The CLI has no flag for it,
because it could only disagree with the server.

`--wait` exits non-zero when a file fails to index or is still indexing at
`--timeout` (default 600 s), so a script can gate on it. `status` exits
non-zero when any file it names is in `error`.

**Per-minute limits are waited out; usage ceilings are not.** Uploads are
throttled per minute and per address — ten in production — so a folder of
documents meets the limit by design. On a 429 that carries a `Retry-After`
(any `Retry-After-<tier>` too) the CLI waits as asked, at most 120 s, up to
three tries per file. A 429 without one is a usage ceiling that lifts next
month: it is reported with the server's message and stops the batch. `--wait`
asks about every file it is waiting for in one request per round, every 8 s,
and if a request fails for any other reason it stops waiting but still prints
what was uploaded (with `--json`, the ids), and exits non-zero.

`upload` takes files, not directories: let the shell expand `docs/*.pdf`.

### `ragen search`

```bash
ragen search "refund policy"            # --max <1-20>, --assistant <id>, --json
```

Retrieval without an answer, over `/v1/search`: the same PII-redacted context
block the chat endpoint gives its answer model, and the files it came from.
When an answer is wrong, this tells you whether retrieval found the passage or
the model ignored it.

### `ragen brain`

Ragen Brain — the organization's curated knowledge — from a terminal,
read-only. Point it at your installation's API with a key belonging to an
owner or admin of an organization that has Brain on:

```bash
export RAGEN_API_URL=https://api.example.com
export RAGEN_API_KEY=sk-...
ragen brain next                 # the one thing worth doing now
ragen brain doctor               # exits 1 if a check fails
ragen brain findings             # contradictions, stale, unowned…
ragen brain pages "urlop"        # search pages (--status CANDIDATE|APPROVED|STALE|REJECTED)
ragen brain graph --focus <id>   # a page's neighbourhood; --json for nodes and edges
ragen brain graph --html g.html  # the graph as a page to open in a browser
ragen brain query "urlop?"       # ask as chat does (--assistant <id> or RAGEN_ASSISTANT_ID)
ragen brain export ./brain       # markdown + graph.json + manifest.json
```

The command set borrows SwarmVault's (`next`, `doctor`, `graph`), but not
its storage. Brain's source of truth is the installation's database and its
decision ledger, so every command reads `/v1/brain/*` and none writes —
except `query`, which asks `/v1/chat` exactly as a chat turn would.
Approving, merging and publishing stay in the panel, because they need the
sources and the access list in front of the person deciding. `export`
refuses a bundle path that would land outside the target directory.

## What does not work yet

`plugin` is listed in `ragen help` under **Not built yet**. Running it prints
what it is waiting on and **exits non-zero**, so a script cannot mistake it for
a no-op that succeeded.

`ragen plugin` in particular waits on custom MCP connectors. Ragen's extension
API is MCP — third-party code runs out of process and never inside the app —
and the piece that lets an organization point Ragen at its own server is
designed but not built. See ADR-38 in the main repository.

## Versioning

This CLI talks to an installation over the public API, and a self-hosted fleet
runs many versions at once. Its version number describes the client, not the
server it is pointed at.

## Node

`engines` asks for Node 20 or newer, which is deliberately lower than the Node
24 a Ragen *installation* requires. This is a client; refusing to print help on
Node 20 would be untrue and unhelpfully broad. `ragen create` inherits
`create-ragen-app`'s own check, which refuses at the point where a too-old Node
would actually damage the install.

## Publishing (manual)

There is no publish job in CI. From a clean checkout:

```bash
npm version <patch|minor|major> --workspace=ragen-cli
```

Land that on `main` **before** publishing. npm versions are immutable: a
publish that runs ahead of the repository cannot be corrected by re-publishing,
only by pushing the commit that should have gone first, and `npm unpublish` is
limited to 72 hours and burns the version number permanently.

```bash
npm publish --workspace=ragen-cli
```

`prepack` runs `clean` before `build` deliberately — `files` publishes `dist`
wholesale, so without the clean a deleted source file lingers in the tarball.

Then exercise what was actually published, not what was packed:

```bash
npm install -g ragen-cli@latest && ragen --version
```

## Licence

Apache-2.0.
