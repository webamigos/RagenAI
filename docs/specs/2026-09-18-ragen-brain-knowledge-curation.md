---
title: Ragen Brain — curated knowledge as the product, RAG as an optional consumer
status: draft
areas: [knowledge-base, worker, rag, api, admin, self-hosting]
adrs: [11, 13, 16, 17, 19, 21, 26, 27, 32, 33, 37, 38, 42, 43, 44]
---

# Ragen Brain — curated knowledge as the product

## TLDR

Brain takes a company's unstructured documents and produces **curated
knowledge** — knowledge pages with an owner, an access level and citations back
to the source — browsable as a list, as files and as a graph, with import into
Ragen as an option rather than a prerequisite. The non-obvious part is that the
deliverable is a **knowledge bundle** (markdown + `graph.json` + a manifest),
not a database: the customer can read the result without our software, which is
the one axis on which we beat the closed vertical platforms in the research.

The research is done — [Ragen Brain — research konkurencji i rekomendacja
(2026-09)](https://app.clickup.com/9014546163/docs/8cmy3qk-10174) — and it
settles two things independently of everything below: the stack is TypeScript
(the only part that genuinely wanted Python, parsing, is already solved by
Docling as a companion service), and the market gap is real. What it does
**not** settle is the four decisions in `Open Questions`, and this spec cannot
be written past them.

## Open Questions

<!--
Hard gate, per docs/specs/README.md. While this block is here the spec is not
ready to implement and no code should be written from it. Q1–Q4 are the four
decisions carried over from ClickUp task 86bc1fd2r; Q5–Q7 surfaced while
reading this repository against the research and are structural in the same
sense — a wrong assumption means rewriting the spec, not a refactor.
-->

- **Q1. What is v1's value: a compiled wiki, or a report on contradictions and
  gaps?** These are two products, two demos and two integration costs. The
  research (§19) is blunt about the second-order effect: the seam with Ragen is
  cheap for a wiki and **almost nonexistent for a report** — if v1 is a report,
  Ragen integration is not in v1 at all and the landing-page copy has to say so.
- **Q2. Separate product, or a module inside this monorepo?** This decides
  packaging, the open-core boundary, the licence story and whether Brain gets
  `apps/brain` plus `packages/brain-*` here or its own repository. The pricing
  signal from the research (Swimm's fixed price per stage, TZ's one-off
  implementation plus maintenance — neither is per-seat) points away from
  Ragen's own pricing model, which is an argument for a separate product, and
  against the monorepo's usual gravity. Note ADR-32's rule: measure drift
  before splitting, not after.
- **Q3. Does `candidates/` + human approval ship in v1, or is v1
  "generate and show"?** Research recommendation: it ships — without it the
  product is a generator of probably-true knowledge and there is no difference
  against SwarmVault or WeKnora. It is also the single largest UI cost in v1.
- **Q4. Name: Brain / Forge / Studio.** Not cosmetic here: it fixes package
  names, the `platform-contracts` namespace and the route prefix. **This is
  being decided by default right now** — the announcement page on ragen.ai uses
  "Ragen Brain" and the phrase "part of Ragen", which quietly answers Q4 *and*
  Q2. Publishing it before this block is resolved makes the decision without
  making it.
- **Q5. Where does a bundle live at rest — files or Postgres?** The research
  says the artefact is a directory of markdown plus `graph.json` plus a
  manifest, versionable in git. This repository has `packages/storage`
  (ADR-27, local by default) and Postgres, and no git-as-a-datastore anywhere.
  The three candidates — Postgres as the source of truth with the bundle as an
  export; the bundle in object storage as the source of truth with Postgres as
  an index; a git remote as the source of truth — differ in what "review a
  change" means, and the answer decides the data model section entirely.
- **Q6. Is a knowledge page a `UserFile`, or a new entity?** Today
  `DocumentCitation` and `DocumentRetrieval` are keyed on `fileId`, and
  `accessible_by` is computed per file by `computeFileAccessPrincipals`. If a
  knowledge page arrives as a `UserFile` with `chunking: predefined`, import is
  nearly free and two-level citations are impossible; if it is a new entity,
  citations become `chunk → knowledge page → source documents` and this is the
  one change that touches working code (§14.3 of the research). Ties to Q1: a
  report-only v1 does not need this answered at all.
- **Q7. Does §14.2's permission default hold — a knowledge page inherits the
  *intersection* of its sources' principals, widened only by a human, with a
  ledger entry?** The research recommends it and I agree; I am raising it
  because it is the one default that is irreversible in one direction. A union
  default is a data leak at the first customer with an HR folder, and no test
  in `tests/architecture/` would catch it.

## Problem

<!-- Filled after the gate. The shape, from the research and this repository: -->

Ragen retrieves over raw documents. Access is decided per **file**, at upload,
and inherited into `accessible_by` on every chunk. Nobody decides, at any point,
what is *true*, what supersedes what, who owns a given statement, or what the
corpus is missing — and WikiContradict (IBM, arXiv:2406.13805) is the evidence
that the model will not resolve a contradiction at answer time either. So a
contradiction between two uploaded documents is resolved, if at all, by
whichever chunk reranks higher.

## Out of scope

<!-- Filled after the gate. Known entries already: -->

- **Full bitemporality** (Utopia, Graphiti — two independent time axes).
  `validFrom` + `supersededBy` on a fact is the deliberate minimum.
- **Graph-expanded retrieval inside Ragen.** README.md:470 says a knowledge
  graph layer is not planned — _"We would rather improve retrieval we can
  measure than add a stage we cannot."_ The graph stays in Brain as navigation
  and control. It enters Ragen's retrieval only behind an eval that beats
  baseline, per ADR-20 — which honours the statement rather than breaking it.
- **Brain writing to Qdrant.** Brain produces a bundle; Ragen ingests it. No
  shared writes to the vector store, or the "the result is yours and readable
  without us" promise stops being technically true.

## Proposed solution

<!-- Blocked on Q1, Q2, Q5, Q6. The seams that hold whichever way they go: -->

- The bundle contract (manifest + page frontmatter, Zod) lives in
  `packages/platform-contracts` per ADR-33 — declared once, never per app.
  Frontmatter shape is drafted in §18 of the research: `type`, `owner`,
  `accessibleBy`, `layer`, `validFrom`, `supersededBy`, `status`,
  `verifyEvery`, `lastVerifiedAt`, `lastVerifiedBy`, `sources[]` with span and
  hash. `status`/`verifyEvery`/`lastVerified*` are Guru's verification model,
  and having them in the schema from day one turns "what is stale and
  unowned" into a query rather than a module.
- Parsing stays Docling as a companion service. No new runtime — that is the
  whole reason the stack question was closed.
- Extraction is LLM calls with structured output through the in-process gateway
  (ADR-49), with Zod schemas. Cost per document is several LLM passes and
  belongs in the cost model on day one, not at the first 40k-document pilot.

## Core surfaces touched

| Surface                                | Change                                              | What catches a mistake                    |
| -------------------------------------- | --------------------------------------------------- | ----------------------------------------- |
| `packages/platform-contracts`          | bundle manifest + page frontmatter schema           | package tests; `shared-contracts-are-not-recopied` |
| `prisma/schema.prisma`                 | depends on Q5/Q6                                    | migration + `npm run verify`              |
| `apps/worker`                          | bundle as a source with `chunking: predefined`      | worker tests + `worker:test:jobs`         |
| `packages/rag-core` (`vector-metadata`) | a `layer` field on the chunk payload                | package tests + every consumer's build    |
| `accessible_by` / tenant scoping       | filled by curation instead of inherited from a file | `every-ingest-path-writes-accessible-by`, tenant-scope audit |
| citations (`DocumentCitation`)         | only if Q6 says "new entity"                        | migration + e2e; this is the working-code change |

## Data model

<!-- Blocked on Q5 and Q6. -->

## Failure modes

<!-- Blocked. Known candidates: extraction cost runaway on a large corpus;
a knowledge page whose sources were deleted; two curators approving
conflicting candidates concurrently; a bundle re-import after the source
document's access changed; Docling down mid-ingest. -->

## Phases

<!-- Blocked. The one ordering constraint already known, from §19: the bundle
contract is small, comes first, and blocks everything else. -->

## Testing

<!-- Blocked. One rule already fixed: anything that must gate a merge goes in
`smoke-*` or `p0-*` — a `p1`–`p3` e2e test does not block the PR that breaks
it. -->

## Rollout and rollback

<!-- Blocked. -->

## Sources

- ClickUp: [Ragen Brain — research konkurencji i rekomendacja
  (2026-09)](https://app.clickup.com/9014546163/docs/8cmy3qk-10174), incl. the
  second research pass (§9–13) and the Ragen integration pass (§14–19)
- ClickUp: [Ragen Brain — decyzja o zakresie v1](https://app.clickup.com/t/86bc1fd2r),
  [Ragen Brain jako zestaw agentów](https://app.clickup.com/t/86bc25wrv)
