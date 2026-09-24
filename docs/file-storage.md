# File storage

Split out of `README.md` so the README can introduce the product rather than
document it. Reached from the README's architecture section and from [ADR-27](adrs/27-storage-abstraction-local-by-default.md).

Documents are stored on the **local filesystem by default** (`./data/storage`,
overridable with `STORAGE_LOCAL_PATH`), so a fresh clone runs with no cloud
account. Object storage is opt-in:

```bash
STORAGE_PROVIDER=s3
S3_ENDPOINT_URL=...        # omit for real AWS S3
S3_BUCKET_NAME=...
S3_REGION=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=1      # if your provider needs path-style addressing
```

`s3` means any S3-compatible store — AWS S3, Cloudflare R2 (`S3_REGION=auto`),
Scaleway Object Storage, RustFS, MinIO, Ceph, LocalStack. Every var here uses an
`S3_` prefix, not `AWS_` — those are reserved for real AWS config (Bedrock,
KMS), which a deployment can then use at the same time as non-AWS S3 storage
instead of the two fighting over one slot.

> **Use `s3` for any deployment with more than one replica.** With `local`, the
> worker writes documents to its own container's disk and the app cannot read
> them, and a restart loses anything not on a mounted volume. Ragen logs a
> warning at startup when `local` is combined with `TARGET_ENV=production` or
> `staging`. Single-node self-hosted installs on a mounted volume are fine.

## Object storage you run yourself: RustFS

For an install that wants object storage without a cloud account, compose ships
[RustFS](https://github.com/rustfs/rustfs) behind the opt-in `s3` profile.
`create-ragen-app` sets it up when you answer **RustFS** to the storage
question: it generates keys, writes them to both files below and starts the
profile. By hand:

```bash
# .env — read by docker compose
RUSTFS_ACCESS_KEY=<a random key id>
RUSTFS_SECRET_KEY=<a random secret>

# .env.local — read by the apps on the host
STORAGE_PROVIDER=s3
S3_ENDPOINT_URL=http://localhost:59000
S3_FORCE_PATH_STYLE=true
S3_REGION=us-east-1
S3_BUCKET_NAME=ragen
S3_ACCESS_KEY_ID=<same as RUSTFS_ACCESS_KEY>
S3_SECRET_ACCESS_KEY=<same as RUSTFS_SECRET_KEY>
```

```bash
docker compose --profile s3 up -d
```

- **Three services.** `rustfs` serves S3 on 59000 and its console on 59001;
  `rustfs-volume-init` gives the data volume to the UID RustFS runs as;
  `rustfs-bucket-init` creates the `ragen` bucket if it is missing. Both init
  containers run once and exit.
- **Two files, one pair of keys.** Compose reads `.env`, the apps read
  `.env.local`; the values must match, or every upload fails with a signature
  error. Without `RUSTFS_*` in `.env` the server starts with keys printed in
  `docker-compose.yml` — fine for a trial, wrong for real documents.
- **Apps in containers** (`npm run ragen:up:everything`) reach RustFS by
  service name, not `localhost`. Put the S3 variables in `.env` too and set
  `S3_CONTAINER_ENDPOINT_URL=http://rustfs:9000`; the full-app compose file
  prefers it over `S3_ENDPOINT_URL`.
- **Tested against the real thing.** `packages/storage`'s integration test
  uploads, downloads (including a multipart object over 5 MiB), maps a missing
  key to `StorageNotFoundError` and deletes, against a running RustFS:

  ```bash
  docker compose --profile s3 up -d rustfs-bucket-init
  set -a; . ./.env; set +a       # your install's RUSTFS_* keys, if it has them
  S3_INTEGRATION_ENDPOINT=http://localhost:59000 npx vitest run \
    packages/storage/src/__tests__/s3-provider.integration.test.ts
  ```

  CI runs it too. MinIO speaks the same API and should behave the same, but
  only RustFS is exercised.

See [ADR-27](adrs/27-storage-abstraction-local-by-default.md).
