---
sidebar_position: 4
---

# Security and privacy

Written for the review that precedes a deployment. Where something is
configuration-dependent or not built yet, this page says so – a claim you can
check is worth more than one you cannot.

## Where data is stored

Wherever you install Ragen. Everything Ragen stores – documents, Postgres, the
Qdrant index, conversation history, backups and encryption keys – lives on
infrastructure you control. There is no hosted offering, and **no component
reports back to the vendor**. OpenTelemetry support exists but is inert unless
you point `OTEL_EXPORTER_OTLP_ENDPOINT` at a collector you run.

Storage is not the whole question. Whether document *content* is transmitted
during processing depends on how you configure the model layer, below.

## What leaves your network

Every model call goes through a LiteLLM proxy you also run.

| Configuration | What leaves your network |
|---|---|
| LiteLLM pointed at a locally-served model | Nothing, in normal operation |
| LiteLLM pointed at a commercial API | The prompt: the question plus the retrieved chunks needed to answer it |

Two things to know before assuming isolation:

**Parsing is local by default, but it falls back.** `DOCUMENT_PARSER=docling`
parses on your own hardware. If Docling fails, the worker falls back to loaders
that send PDFs to an external model. `DOCLING_STRICT=1` fails the ingest
instead. For a deployment that must not transmit documents, that variable is not
optional.

**A fully air-gapped deployment is deployment work, not a flag.** See
[Self-hosting](/docs/self-hosting#running-without-internet-access).

**The application sends no analytics and no telemetry.** No tag manager, no
product analytics, no usage ping: nothing in the app measures your users, and
an architecture test fails our build if anything is added that would. Traffic
measurement exists only on this documentation site, which we host ourselves.

This is a correction, not a long-standing property. Earlier builds carried a
Google Tag Manager container of ours, switched on by `TARGET_ENV=production` —
the value this guide asks you to set — so a self-hosted install loaded our tag
manager on every page of the panel. If you are running one of those builds,
upgrade; there is nothing to configure in order to opt out.

## Training

**No.** Your documents are not used to train or fine-tune any model, and not to
improve the product. There is no training pipeline in Ragen – no code exists
that could do it.

If you route to a commercial API, that provider's terms govern what they do with
prompts. Enterprise tiers generally offer zero retention; confirm the terms for
your plan. If the question needs to be unanswerable rather than answered, serve
the model locally.

## Encryption

**At rest.** Message content is encrypted with **AES-256-GCM** using envelope
encryption: each conversation thread gets its own key, itself encrypted by a
master key in your key provider. Three providers are supported – Scaleway Key
Manager, AWS KMS, or a local master key – selected with `ENCRYPTION_PROVIDER`.

Thread *titles* stay in plaintext so title search works. Content search over
encrypted threads is therefore title-only: a deliberate trade-off.

:::warning Encryption is opt-in

With no key provider configured, Ragen starts normally and stores message
content **unencrypted**. That keeps local development simple; a production
install must configure a provider explicitly. Verify by checking that
`encryptedDek` is populated for new threads.

:::

**In transit.** TLS on connections to the application, terminated by your own
ingress. Internal service-to-service calls are additionally authenticated with
an HMAC-signed short-lived token, so a component cannot be impersonated from
inside the network.

## Access control

Two independent role hierarchies – application-level and organization-level –
plus per-folder and per-file permissions granted to users or teams.

**The part worth interrogating in any RAG product:** permissions are enforced at
retrieval, not in the UI.

Every indexed chunk carries an `accessible_by` list, and queries from
non-administrators apply it as a filter *before* the vector search runs. Content
a user cannot open therefore cannot appear in an answer or in a citation.

The common failure mode elsewhere is a permission filter on the *file list*
while retrieval searches the whole corpus: the user never sees the document but
does get an answer synthesized from it. Test this against your own roles before
going to production.

Tenant isolation is enforced separately. Organization scoping runs through the
data model, each organization gets its own Qdrant collection, and a guard logs
any query that touches a tenant-scoped model without its organization filter.

**Not built yet:** SSO (SAML, Entra ID, SCIM) and MFA. Authentication today is
username and password with per-organization membership, plus opaque API keys for
programmatic access, stored non-reversibly with only a masked value in the
database.

## Audit and logging

Two separate logs.

**Audit log** – who did what and when, with before-and-after state: document
upload and deletion, permission and role changes, API key creation and
revocation.

**Security event log** – 21 event types across a three-level severity scale
(`info` / `warn` / `critical`) with a handling status: failed logins and
brute-force attempts, attempted cross-organization access, detected prompt
manipulation, detected personal data, rate-limit breaches. Entries carry IP
address, user agent and a request identifier.

:::info No retention policy

Neither log has a retention policy or an automatic deletion path – rows
accumulate until you remove them. Both tables hold personal data, so defining
retention is the operator's responsibility.

:::

**Not built yet:** direct export to a SIEM. Both logs are queryable in Postgres
and through the admin interface.

## Prompt injection and personal data

Document content is treated as data, not as instructions. The system prompt
carries an explicit confidentiality rule and is regression-tested against a
red-team suite.

No one can guarantee a language model never produces a wrong answer, and we do
not claim it. What the system does is cite only sources present in the retrieved
material, and say it did not find an answer rather than construct one. Both are
measurable, and the evaluation harness includes a hallucination guard and a
sycophancy guard.

**Personal-data detection** via Microsoft Presidio, with Polish recognizers
(PESEL, NIP, REGON, ID card, IBAN). **Off by default** – enable with
`FEATURE_FLAG_PII_MASKING=1`. Presidio is two extra containers, and requiring
them merely to ingest a document would make them a hard dependency of the core
product. Per-organization and per-file strictness is configured separately.

## Administrator control

The media, backups, keys and database are yours, so an operator with database
and disk access has complete control over stored data by definition. What the
*application* offers is narrower:

- **Organization owners and admins** delete files and revoke document
  permissions within their organization, and manage users, models and limits.
- **Thread export is per-thread**, scoped to one organization. There is no
  export-everything route.
- **Index cleanup on deletion is best effort.** Deleting a document removes its
  vector entries in the same flow, but that flow can fail independently of the
  database delete – verify rather than assume in bulk operations.
- **Shutting the process down** is the deployment operator's job, not an in-app
  action.

## Data ownership

Your documents, the index built from them, and the answers generated from them
are yours. Nothing in Ragen transmits document content anywhere except the model
backend you configure.

## Checking any of this

Ragen is open source under Apache 2.0. The architecture decisions, the code that
implements isolation and encryption, and the evaluation harness that measures
answer quality are all readable.

If you are evaluating Ragen against strict confidentiality requirements, the
useful exercise is a controlled test on your own documents, your own roles and
your own questions. Better measured than believed – including when the claims
are ours.
