# Open-core boundary

Ragen is open core: the project is licensed under [Apache 2.0](../LICENSE), and
a small commercial layer sits beside it.

## The rule

**If a directory contains its own `LICENSE` file, that file governs the
directory and everything under it.** Everything else is Apache 2.0.

There is no other mechanism — no per-file headers, no allowlists, no hidden
exceptions. To find out whether a path is open, look for the nearest `LICENSE`
above it.

## Commercial paths

**None yet.** No directory holds Ragen's own commercial code.

When commercial directories are added they will be listed here, and each will
carry its own `LICENSE`.

## Third-party paths

**None.** Same mechanism as above, different nature: code the project did not
write, obtained under separate terms, and therefore outside the Apache grant.

There was one — `apps/web/src/libs/tui/`, a vendored UI component set that
could not be redistributed apart from Ragen. It is gone, replaced by
`apps/web/src/components/ui` (shadcn, MIT) and by primitives written against
this repository's own token layer. See
[ADR-41](adrs/41-one-component-library-shadcn.md).

So every path in this repository is now under the Apache grant in the root
`LICENSE`, with no carve-out to check before redistributing. If a third-party
path is ever added it will be listed here and carry its own `LICENSE`, which
governs it and everything under it.

## Contributing

Contributions to Apache-licensed code are welcome — see
[CONTRIBUTING.md](../CONTRIBUTING.md).

**Contributions to commercial paths cannot be accepted**, however good they are.
This is a licensing and IP constraint, not a judgement about the code: those
directories are governed by separate commercial terms, and the inbound Apache
licence that covers your pull request does not extend to them.

If you have found a bug in commercial code, please report it as an issue
describing the problem, without a proposed code change. If you want to build on
or extend it, get in touch at [info@ragen.ai](mailto:info@ragen.ai).

## What stays open, permanently

Two commitments that constrain what may ever become commercial:

**Security is not an upsell.** Tenant isolation, encryption at rest, PII masking
and access control are part of the core and will stay there. Ragen is deployed
by organizations that need control over their own data; charging them extra for
the mechanisms that provide it would undercut the point of the product.

**The core never degrades because the commercial layer is absent.** Ragen runs
without Stripe, without Presidio, without a telemetry backend and without AWS
KMS — each of those is optional by design, not by accident (see
[ADR-24](adrs/24-optional-pii-masking.md) for the reasoning). Any future
commercial feature has to preserve that: an install with no commercial licence
is a complete, working Ragen, not a crippled one.

**Multi-tenancy is core.** Organization scoping is structural — it runs through
the data model, the vector store and the access-control layer
([ADR-23](adrs/23-tenant-scope-guard.md)). It is not a feature that could be
withheld, and it will not become one.

## Administering your own install

Operators can always manage their own deployment: users, models, limits, usage
and settings. A deployment you cannot administer is not a working product, so
the admin application stays open.
