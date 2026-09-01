# infra/

Supporting services Ragen runs alongside its own applications. These are not
`apps/` — they are vendor images plus the configuration and thin wrappers we
maintain around them — and not `packages/`, because nothing imports them.

| Directory | What it is | Deployed as |
|---|---|---|
| `litellm/` | LiteLLM proxy: `config.yaml` is the **source of truth for every model name** the platform can use, plus a Dockerfile and entrypoint | its own Railway service |
| `docling/` | IBM Docling parser used by the ingest worker (`DOCUMENT_PARSER=docling`, the default) | its own Railway service |
| `presidio/analyzer/` | Presidio analyzer with Polish recognizers, for optional PII masking (ADR-24) | its own Railway service |
| `otel/` | OpenTelemetry Collector config for the optional local observability stack | local only |

Each of the first three carries its own `railway.toml`. **If you move a
directory here, the matching Railway service's root directory has to change with
it** — the file is what points Railway at the Dockerfile.

## Running things

```bash
npm run ragen:up:full        # backing services only; run the apps on the host
npm run ragen:up:everything  # everything, including web/api/worker/admin
npm run ragen:down           # stop it all
```

`ragen:up:full` is the development default: containers for the dependencies,
your own apps running from source with hot reload. `ragen:up:everything` layers
`docker-compose.fullapp.yml` on top and runs Ragen's own applications in
containers too — the closest thing to a production deployment you can get on one
machine, and the fastest way for someone evaluating a self-hosted install to see
it working without installing Node.

## Configuration

Compose fills `${VAR}` from your shell or the project's `.env`. The full-app
stack wires services to each other by container name (`postgres:5432`,
`http://litellm:4000`), so nothing there points at `localhost`.

`STORAGE_PROVIDER=local` is passed to web, api and worker together with a
**shared `storage_data` volume**. They must agree: the worker writes documents
the app has to read back, and separate volumes mean uploads that vanish. See
[ADR-27](../docs/adrs/27-storage-abstraction-local-by-default.md).
