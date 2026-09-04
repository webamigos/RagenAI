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
Scaleway Object Storage, MinIO, Ceph, LocalStack. Every var here uses an
`S3_` prefix, not `AWS_` — those are reserved for real AWS config (Bedrock,
KMS), which a deployment can then use at the same time as non-AWS S3 storage
instead of the two fighting over one slot.

> **Use `s3` for any deployment with more than one replica.** With `local`, the
> worker writes documents to its own container's disk and the app cannot read
> them, and a restart loses anything not on a mounted volume. Ragen logs a
> warning at startup when `local` is combined with `TARGET_ENV=production` or
> `staging`. Single-node self-hosted installs on a mounted volume are fine.

See [ADR-27](adrs/27-storage-abstraction-local-by-default.md).
