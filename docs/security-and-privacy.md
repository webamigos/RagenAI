# Security and data privacy

Written for the security review that precedes a self-hosted deployment. Every
claim here is a statement about what the code in this repository does, with a
pointer so you can check it yourself. Where something is configuration-dependent
or not built, it says so.

If you find a claim here that the code does not support, that is a bug — please
[report it](../SECURITY.md).

## Where data is stored

Wherever you install it. Ragen is self-hosted: **everything Ragen stores** —
documents, Postgres, the Qdrant index, conversation history, backups and
encryption keys — lives on infrastructure you control. There is no first-party
hosted offering, and no component reports back to us.

Storage is not the whole question, though. Whether document *content* is
transmitted to a third party during processing depends on how you configure the
model backend, which is the next section. A deployment can store everything
locally and still send text to a commercial API to get an answer.

There is **no telemetry channel to the vendor**. OpenTelemetry support exists,
but it is inert unless you set `OTEL_EXPORTER_OTLP_ENDPOINT` to a collector *you*
run — with it unset the tracer is a no-op ([ADR-22](adrs/22-observability-opentelemetry.md)).

## What leaves your network

This is the question that matters most, and the honest answer is: **it depends
on how you configure the model layer**, because that is the only part of Ragen
that needs to talk to anything.

Ragen routes every LLM and embedding call through a [LiteLLM](https://docs.litellm.ai/)
proxy that you also run. LiteLLM decides which backend answers. That indirection
is the whole reason the model layer is swappable — see
[ADR-04](adrs/04-litellm-unified-llm-gateway.md).

| Configuration | What leaves your network |
|---|---|
| LiteLLM pointed at a locally-served model | Nothing, in normal operation |
| LiteLLM pointed at a commercial API | The prompt: the question plus the retrieved document chunks needed to answer it |

**Two things to know before assuming isolation:**

1. **Document parsing is local by default, but the fallback is not.**
   `DOCUMENT_PARSER=docling` (the default) parses on your own hardware — Docling
   runs as a container in the default compose stack and does layout analysis and
   OCR locally. The alternative, `legacy`, sends PDFs to an external model as
   base64.

   The catch is the fallback: **if Docling fails, the worker falls back to the
   legacy loaders**, so a Docling outage would send the document off-site
   precisely when local parsing is unavailable. Set `DOCLING_STRICT=1` to fail
   the ingest instead. For a deployment that must not transmit documents, that
   variable is not optional.
2. **A fully air-gapped deployment is real work, not a config flag.** The
   architecture supports it — the model layer is genuinely decoupled — but
   running a capable model on your own hardware means GPU capacity, and locally
   served open models generally answer less well than commercial ones today. How
   much less depends on your documents and your questions. Measure it on your own
   material before committing to the trade-off; `evals/` exists for exactly that.

Nothing else phones home. After installation the only outbound needs are an SMTP
server for notifications (your own internal one works) and pulling container
images, which can be done once and then served from your internal registry.

## Training

**No.** Your documents are not used to train or fine-tune any model, and not
used to improve the product. Ragen has no training pipeline — there is no code
here that could do it.

If you route to a commercial API, that provider's terms govern what they do with
prompts. Enterprise tiers of the major providers offer zero-retention terms;
confirm the terms for the specific tier you're on. If this question needs to be
unanswerable rather than answered, serve the model locally.

## Encryption

**At rest.** Message content is encrypted with **AES-256-GCM** using envelope
encryption: each conversation thread gets its own data encryption key, which is
itself encrypted by a master key held in your key provider
([ADR-06](adrs/06-thread-message-encryption.md)). Three providers are supported —
Scaleway Key Manager, AWS KMS, or a local master key — selected by
`ENCRYPTION_PROVIDER` (`src/libs/crypto/key-provider/`). The master key never
leaves your control.

Thread *titles* are stored in plaintext deliberately, so that title search
works. Content search over encrypted threads is therefore title-only — a
deliberate trade-off, documented in ADR-06.

> **Important:** encryption is opt-in. With no key provider configured, Ragen
> starts normally and stores message content **unencrypted**
> (`create-message-command.ts`). This is intentional so that local development
> works without a KMS, but it means a production install must configure a
> provider explicitly. Verify it: check that `Thread.encryptedDek` is populated
> for new threads.

Disk-level encryption is yours to provide and is independent of the above.

**In transit.** TLS on connections to the application, terminated by your own
ingress. Internal service-to-service calls are additionally authenticated with
an HMAC-signed short-lived token, so a component cannot be impersonated from
inside the network.

## Access control

Two independent role hierarchies, deliberately not merged: application-level
(platform administrator) and organization-level (owner / admin / member). On top
of that, per-folder and per-file permissions can be granted to individual users
or to teams.

**The part worth interrogating in any RAG product:** permissions are enforced at
retrieval, not in the UI.

Every indexed chunk carries an `accessible_by` array in its vector-store
payload, and non-admin queries add that as a filter before the vector search
runs (`src/app/api/threads/services/initializeBasicRag.ts`). Content a user
cannot open therefore cannot appear in an answer or in a citation either.

This matters because the common failure mode elsewhere is a permission filter on
the *file list* while retrieval searches the whole corpus — the user never sees
the document but does get an answer synthesized from it. Test this against your
own roles before going to production.

Tenant isolation is enforced separately: organization scoping runs through the
data model, and each organization gets its own Qdrant collection. A warn-only
guard logs any query that touches a tenant-scoped model without its
organization filter ([ADR-23](adrs/23-tenant-scope-guard.md)).

**Not built yet:** SSO (SAML, Entra ID, SCIM directory sync) and MFA. Today
authentication is username/password with per-organization membership, plus
opaque API keys for programmatic access ([ADR-13](adrs/13-opaque-api-keys.md)) —
stored non-reversibly, with only a masked value in the database.

## Audit and logging

Two separate logs.

**Audit log** records who did what and when, with before-and-after state
(`oldData` / `newData` on the `AuditLog` model): document upload and deletion,
permission and role changes, API key creation and revocation.

**Security event log** covers 21 event types across a three-level severity scale
(`info` / `warn` / `critical`) with a handling status — failed logins and
brute-force attempts, attempted cross-organization access, detected prompt
manipulation, detected personal data, and rate-limit breaches. Entries carry IP
address, user agent and a request identifier (`requestId`), plus a resolution
timestamp and resolver once handled. See
[`security-monitoring.md`](security-monitoring.md).

**Neither log has a retention policy or an automatic deletion path** — rows
accumulate in Postgres until you remove them. Defining retention, and deleting
against it, is the operator's responsibility; both tables hold personal data
(IP address, user agent, user id), so they fall under whatever retention rules
apply to the rest of your deployment.

**Not built yet:** direct export to a SIEM. Both logs are queryable in Postgres
and via the admin interface; shipping them to Splunk or Sentinel today means
reading those tables or the application's structured logs.

## Prompt injection and personal data

Document content is treated as data, not as instructions. The system prompt
carries an explicit confidentiality rule and is regression-tested against a
red-team suite in `evals/datasets/red-team.yaml` — a real prompt-disclosure leak
was found and fixed this way, with before-and-after measurement.

Nobody can guarantee a language model never produces a wrong answer, and we do
not claim it. What the system does is cite only sources present in the retrieved
material and say it did not find an answer rather than construct one. Both
behaviours are measurable — `evals/e2e-rag/` includes a hallucination guard and
a sycophancy guard, and you should run them against your own questions.

**Personal data detection** via Microsoft Presidio, with Polish-language
recognizers (PESEL, NIP, REGON, ID card, IBAN). This is **off by default** and
enabled with `FEATURE_FLAG_PII_MASKING=1`: Presidio is two extra containers, and
requiring them just to ingest a document made it a hard dependency of the core
product ([ADR-24](adrs/24-optional-pii-masking.md)). Per-organization and
per-file strictness is configured separately via `piiPolicy`.

## Administrator control

The media, backups and keys are yours, and so is the database — an operator with
database and disk access has complete control over the stored data by
definition. What the *application* offers is narrower than that, and worth
stating precisely:

- **Organization owners and admins** can delete files and revoke document
  permissions within their own organization, and manage users, models and
  limits.
- **Application-level admins** additionally have the encryption actions
  (encrypt-all-threads).
- **Thread export is per-thread**, scoped to one organization and requiring
  ownership or organization-admin access. There is no export-everything route.
- **Index cleanup on deletion is best effort.** Deleting a document removes its
  vector-store entries in the same flow, but that flow can fail independently of
  the database delete — verify rather than assume, especially in bulk
  operations.
- **Shutting the process down** is the deployment operator's job (`SIGTERM`),
  not an in-app action.

We have no standing access to your deployment. Any access we hold is access you
granted by name and can revoke.

## Data ownership

Your documents, the index built from them, and the answers generated from them
are yours. The [Apache 2.0 licence](../LICENSE) covers the software; it makes no
claim on your data. Nothing in this repository transmits document content
anywhere except the model backend you configure.

## Formats

PDF, DOCX, PPTX, XLSX, CSV, Markdown, plain text, EPUB, SRT, images and URLs.
Tables retain their structure rather than collapsing into a run of numbers, and
document structure (headings, sections) is preserved into chunk metadata so
citations can point at a section rather than just a filename
([ADR-17](adrs/17-type-specific-chunking.md),
[ADR-18](adrs/18-pdf-heading-detection.md),
[ADR-19](adrs/19-section-aware-context-rendering.md)).

Extraction quality on scanned documents depends on the quality of the scans.
This is usually the largest unknown in a deployment — test it on a representative
sample of your worst scans early, not late.

## Checking any of this

Nothing above requires taking our word for it:

- `docs/adrs/` — the decision record, including the reasoning and the
  trade-offs accepted
- `apps/web/evals/` — the measurement harness: promptfoo suites plus an end-to-end test
  that drives real ingestion and retrieval
- `docs/security-monitoring.md` — event types and alerting
- the code, under the Apache 2.0 licence

If you are evaluating Ragen for a deployment with strict confidentiality
requirements, the useful exercise is a controlled test on your own documents,
your own roles and your own questions. We would rather you measured it than
believed a datasheet.
