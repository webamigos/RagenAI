---
sidebar_position: 10
---

# Roadmap

No dates. This page is the shape of what we are working on, not a commitment to
a release. It changes when a real install needs something we did not expect.
Open work lives in
[GitHub Issues](https://github.com/webamigos/RagenAI/issues).

## A smaller install

Today a full Ragen install is ten containers and around 2.6 GB of idle memory
(the breakdown is on [Self-hosting](./self-hosting.md)). Four of those
containers exist to do something that Postgres, or a hosted API, could do
instead. Four designs — written together, because they only make sense
together — each remove one:

| Instead of                       | Ragen would offer                          | You give up                                              |
| -------------------------------- | ------------------------------------------ | -------------------------------------------------------- |
| Temporal (2 containers)          | BullMQ behind a job-runtime seam           | a crashed job re-runs from the start instead of resuming |
| Qdrant                           | `pgvector` in the database you already run | a shared failure domain, and different retrieval numbers |
| Docling                          | Mistral Document AI over its hosted OCR    | **your documents leave your deployment**                 |
| The LiteLLM proxy (2 containers) | an in-process model gateway                | provider keys move into the application processes        |

Every one of these is **opt-in and off by default**. Nothing here changes what
a full install does or how it performs — the aim is a lower floor, not a
different product. Taken together they are the difference between "Ragen needs
a server" and "Ragen runs on a small VM, or on managed Postgres with no
container orchestration at all".

Two things worth reading before you get excited about the smallest possible
install:

- **The hosted parser is a data-processing decision, not a performance one.**
  With `DOCUMENT_PARSER=mistral` every ingested document is transmitted to a
  third party. That is the right trade for some deployments and disqualifying
  for others, which is why it will never be a fallback that a failure can put
  you into silently. See [Security](./security.md).
- **`pgvector` is a different retrieval system, not a port of the current
  one.** Qdrant scores our sparse vectors server-side; Postgres has no
  equivalent, so the lexical half changes and the results change with it. It
  ships with published measurements or it does not ship.

The designs are public, one file each, in
[`docs/specs/`](https://github.com/webamigos/RagenAI/tree/main/docs/specs) —
they name the trade-offs and the failure modes rather than only the upside.

## Also next

- **A Python client.** The TypeScript SDK is official and published; Python is
  the language most people integrating the API are actually writing in.
- **Slack as a place to ask** — an assistant you talk to in a channel, carrying
  the same retrieval-time access filter as the application. Not the existing
  Slack connector, which reads Slack as a source.
- **A verified air-gapped configuration.** Local model, local embeddings, no
  outbound path, and a script that demonstrates it. The pieces exist today.
- **Microsoft Entra ID sign-in.** SSO and MFA are
  [not built yet](./security.md); Entra ID over OAuth comes first, SAML and
  SCIM after it.
- **`docker compose up` to a working demo**, with sample documents and sample
  questions, so evaluating Ragen does not start with an empty knowledge base.
- **Microsoft 365 connectors:** SharePoint, OneDrive, Outlook, Teams.
- **Feedback collection in the application** — the signal our retrieval work
  has been missing.

## Later

- **Permissions inherited from the source system**, so revocation in Google
  Drive or SharePoint takes effect without waiting for a re-index.
- Confluence and Jira connectors.
- Web search and multi-step research as opt-in tools, because some installs
  deliberately have no outbound path and that has to stay true.
- Audit log and security-event export to a SIEM, with retention and automatic
  deletion.
- Organization export, so leaving Ragen is a documented procedure.
- Fail-closed encryption: refuse to start in production without a key provider,
  rather than starting and storing message content unencrypted.
- MFA and passkeys.
- Per-user permissions for individual MCP tools.
- Usage drill-down from organization to team to user to request, with budget
  alerts.
- A sizing guide, a versioning policy and a CHANGELOG.

## Not planned

Worth saying plainly, because it saves you evaluating Ragen for something it is
not going to be:

- **Image generation, advanced voice mode, a code interpreter.** Ragen answers
  from your documents. A general-purpose assistant is a different product, and
  there are good ones.
- **A knowledge graph layer.** We would rather improve retrieval we can measure
  than add a stage we cannot.
