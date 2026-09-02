# Terraform / OpenTofu

Deploys the [Helm chart](../helm/ragen) onto a Kubernetes cluster that already
exists: it creates the namespace, writes the Secret the pods read, and manages
the release.

## What is deliberately not here

**Creating the cluster.** That is the only genuinely cloud-specific part —
EKS, GKE and AKS differ in networking, IAM and node pools, and a module written
for one is not portable to another. There is no decision yet on where this gets
published, so guessing would mean writing something that has to be thrown away.

Everything below the cluster is cloud-agnostic and is what this module covers.
When the cloud is chosen, add a sibling module for it; the only thing it has to
produce is a kubeconfig context this module can point at. If you would rather
wire providers directly to the cluster's endpoint than through a kubeconfig,
that is the one file to change — `versions.tf`.

Managed data services are handled through chart values rather than code here:
set `postgres.enabled: false` and `config.DATABASE_URL` in a values file and
the chart stops deploying its own. Same for Qdrant, Redis and Temporal. See the
chart's README.

**Do not put the password in `config.DATABASE_URL` literally.** That value is
rendered as a plain `env` entry on every app Deployment, so anyone with `get
deploy` can read it — the key is excluded from the ConfigMap, but that is not
the same as being secret.

Put the password in `secrets` as `POSTGRES_PASSWORD` and reference it from the
URL instead of inlining it. The chart emits `POSTGRES_PASSWORD` before
`DATABASE_URL`, and Kubernetes expands `$(VAR)` against variables declared
earlier, so writing `$(POSTGRES_PASSWORD)` in the password position resolves
from the Secret at pod start:

```yaml
config:
  # …with the literal string $(POSTGRES_PASSWORD) where <password> is below.
  DATABASE_URL: postgresql://<user>:<password>@<host>:5432/<database>
```

The same applies to `litellm.databaseUrl`.

## Secrets and state

**The state file contains every secret in plaintext.** Not encrypted, not
hashed — `kubernetes_secret.data` is stored as given. That is how the
Kubernetes provider works, and it is the single most important thing to get
right here:

- Use a remote backend with encryption at rest and access control. A local
  `terraform.tfstate` on a laptop is a copy of the production credentials.
- Do not commit `.tfvars`. The `.gitignore` covers `*.tfstate*` and `*.tfvars`
  (keeping `*.tfvars.example`), but the discipline matters more than the rule.
- Prefer reading secrets from a secret manager with a data source over passing
  them in at all.

The module writes the Secret rather than letting the chart generate it, and
that is the trade being made: a generated secret exists only in the cluster —
unrecoverable, unrotatable from here — while one managed as state is
recoverable and lands in the state file. For a trial, let the chart generate
them and skip this module. For anything long-lived, manage them, with a backend
that is encrypted.

## Usage

```bash
cp terraform.tfvars.example terraform.tfvars   # then edit; do not commit it
tofu init
tofu plan
tofu apply
```

`terraform` works identically — the configuration is plain HCL with no
tool-specific features. The provider lock file is **not** committed, because
`tofu init` pins `registry.opentofu.org` and `terraform init` pins
`registry.terraform.io`, and each breaks the other. Commit the one your tool
generates once that choice is made.

## What Terraform owns, and what Helm owns

|           | owns                                                  |
| --------- | ----------------------------------------------------- |
| Terraform | the namespace, the Secret, the release and its values |
| Helm      | every workload, service, PVC and the migration hook   |

The split is not arbitrary. Secrets and the namespace outlive a release and
belong in state where they can be rotated and audited. Workloads are the
chart's business, and duplicating them here would mean two descriptions of the
same deployment drifting apart.

Two consequences worth knowing:

- `create_namespace` is `false` and must stay that way. Terraform owns the
  namespace, and letting Helm create it as well gives one object two owners.
- **`tofu destroy` deletes uploaded documents.** An earlier version of this
  file claimed otherwise, and it was wrong. The chart annotates the documents
  PVC with `helm.sh/resource-policy: keep`, but that only stops _Helm_ from
  deleting it. Terraform owns the namespace, and deleting a namespace deletes
  everything in it — Kubernetes garbage-collects the PVC regardless of Helm's
  annotation, and whether the underlying volume survives then depends on its
  StorageClass reclaim policy (`Delete` on most cloud defaults).

  If the documents must outlive a `destroy`, keep them outside the namespace's
  lifecycle: object storage (`storage.enabled: false` plus
  `config.STORAGE_PROVIDER: s3`), or a PV you provision separately with
  `persistentVolumeReclaimPolicy: Retain`.

## Defaults chosen on purpose

- `kube_context` has **no default**. The default context is whatever was used
  last, and this module creates a namespace and a release.
- `atomic = true` — a failed upgrade rolls back rather than leaving some pods
  on the new image and some on the old, against one database.
- `timeout_seconds = 900` — the release runs schema migrations as a pre-install
  hook, and the Docling image loads its models before reporting ready.

## Validation

```bash
tofu fmt -check -diff
tofu init -backend=false
tofu validate
```

Validated with OpenTofu 1.12.6 against the real providers (kubernetes 2.35,
helm 2.17). No cluster was touched: `validate` does not connect, and nothing in
this repository has been applied anywhere.
