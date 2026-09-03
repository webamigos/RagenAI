# File storage

Split out of `README.md` so the README can introduce the product rather than
document it. Reached from the README's architecture section and from [ADR-27](adrs/27-storage-abstraction-local-by-default.md).

Documents are stored on the **local filesystem by default** (`./data/storage`,
overridable with `STORAGE_LOCAL_PATH`), so a fresh clone runs with no cloud
account. Object storage is opt-in:

```bash
STORAGE_PROVIDER=s3
AWS_ENDPOINT_URL=...        # omit for real AWS S3
AWS_S3_BUCKET_NAME=...
AWS_DEFAULT_REGION=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_FORCE_PATH_STYLE=1   # if your provider needs path-style addressing
```

`s3` means any S3-compatible store — AWS S3, Cloudflare R2 (`AWS_DEFAULT_REGION=auto`),
Scaleway Object Storage, MinIO, Ceph, LocalStack.

> **Use `s3` for any deployment with more than one replica.** With `local`, the
> worker writes documents to its own container's disk and the app cannot read
> them, and a restart loses anything not on a mounted volume. Ragen logs a
> warning at startup when `local` is combined with `TARGET_ENV=production` or
> `staging`. Single-node self-hosted installs on a mounted volume are fine.

See [ADR-27](adrs/27-storage-abstraction-local-by-default.md).
