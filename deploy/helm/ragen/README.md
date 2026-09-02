# Ragen Helm chart

Deploys the five workloads in this repository — `web`, `api`, `admin`, `docs`
and the Temporal ingest `worker` — plus the services they depend on.

Everything stateful is bundled and switched on by default, so a fresh cluster
gets a working install from one command. Every one of those is also a
one-line swap for a managed service; see [Managed services](#managed-services).

## Requirements

- Kubernetes 1.25+ and Helm 3.8+
- A default StorageClass (the bundled Postgres, Qdrant and Redis each claim a
  volume)
- Images for the five apps, published somewhere the cluster can pull from.
  The chart does not build them — see [Images](#images).

## Install

```bash
helm install ragen deploy/helm/ragen \
  --namespace ragen --create-namespace \
  --set image.registry=ghcr.io/webamigos \
  --set secrets.OPENAI_API_KEY=sk-...
```

Schema migrations run first, as a `pre-install`/`pre-upgrade` hook using the
web image. A failed migration fails the release rather than leaving pods
running against the wrong schema. If migrations are applied out of band, set
`migrations.enabled: false`.

## Images

`image.registry` plus the app name gives `<registry>/ragen-<app>`, tagged with
the chart's `appVersion`. Override either globally (`image.tag`) or per app:

```yaml
apps:
  web:
    image:
      repository: ghcr.io/acme/ragen-web
      tag: 2.0.1
```

## Secrets

Six secrets have no external owner — `BETTER_AUTH_SECRET`, `SECRET_KEY`,
`INTERNAL_API_SECRET`, `SESSION_AUTH_SECRET`, `WORKER_SECRET_KEY` and
`LITELLM_MASTER_KEY`. The chart generates them on first install and reads them
back on every later render, so an upgrade does not mint a new
`BETTER_AUTH_SECRET` and sign every session out. The Secret carries
`helm.sh/resource-policy: keep`, which also means **`helm uninstall` leaves it
behind** — delete it by hand if you want a genuinely clean slate.

The rest name a third-party provider (`OPENAI_API_KEY`, `GOOGLE_*`,
`SCW_API_KEY`) and have to be supplied. `helm install` lists whichever are
still empty.

To manage all of them yourself, put them in one Secret and set
`existingSecret: my-secret`. The chart then renders none of its own, and that
Secret must contain `POSTGRES_PASSWORD` too.

## Managed services

The bundled Postgres, Qdrant, Redis and Temporal are each a single replica
with no replication, failover or backup. That is deliberate: it makes a trial
install work, and it is not what you want under a production database. Point
the matching `config` entry at a real service and disable the bundled one:

```yaml
postgres:
  enabled: false
qdrant:
  enabled: false
temporal:
  enabled: false
config:
  DATABASE_URL: postgresql://<user>:<password>@db.rds.amazonaws.com:5432/ragen
  QDRANT_URL: https://xyz.qdrant.cloud
  TEMPORAL_SERVER_ADDRESS: eu-central-1.aws.api.temporal.io:7233
```

Nothing else changes — the apps read those URLs through the same helpers
either way. Set `DATABASE_DIRECT_URL` as well if a connection pooler sits in
front of Postgres; migrations use it to bypass the pooler.

Redis is optional (rate limiting only). With `redis.enabled: false` and no
`config.REDIS_URL`, the variable is simply not set.

## Storage

Uploaded documents go on a `ReadWriteMany` PVC shared by `web` (which writes
them) and `worker` (which reads them to parse). Many clusters have no RWX
StorageClass. Where that is the case, use object storage instead:

```yaml
storage:
  enabled: false
config:
  STORAGE_PROVIDER: s3
```

See `packages/storage` (ADR-27) for the S3-compatible settings. The PVC is
annotated `helm.sh/resource-policy: keep`, so uninstalling the release does
not delete uploaded documents.

## Ingress

Off by default. Enable it and route the hosts you need; `web` is the only one
that has to be public.

```yaml
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: ragen.example.com
      app: web
    - host: admin.ragen.example.com
      app: admin
  tls:
    - secretName: ragen-tls
      hosts: [ragen.example.com, admin.ragen.example.com]
```

Each entry routes one host to one app, at `/` by default; `path` and
`pathType` override that per host.

`admin` is the platform admin panel. Exposing it publicly puts the whole
tenant base behind one login — prefer an internal host or an IP allowlist.

## What this chart does not do

- **No autoscaling.** Replica counts are static (`apps.<name>.replicas`).
- **No PodDisruptionBudgets or anti-affinity.** A node drain can take all
  replicas of an app at once.
- **No NetworkPolicies.** Everything in the namespace can reach everything.
- **No liveness probes on the apps.** Readiness keeps traffic off a starting
  pod; there is no dedicated liveness endpoint, and probing `/` would restart
  pods for a slow database rather than a wedged process.
- **No backups**, for any bundled stateful service.

Each of these is a deliberate omission rather than an oversight: they depend
on the cluster and on how the deployment is operated. A production install
should add the ones it needs.

## Validating changes

```bash
helm lint deploy/helm/ragen
helm template ragen deploy/helm/ragen | kubeconform -strict -kubernetes-version 1.29.0
```
