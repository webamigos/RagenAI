---
title: Google's own Workspace MCP servers, beside or instead of ours
status: draft
areas: [integration, knowledge-base, rag]
adrs: [05, 32, 36, 38]
---

# Google's own Workspace MCP servers, beside or instead of ours

## TLDR

Google now publishes eight hosted MCP servers for Workspace, and Ragen already
reaches four Google products through a connector it wrote and runs itself. This
spec decides which of ours they replace, which they cannot, and whether an
organisation ends up holding two Google OAuth grants instead of one.

## Open Questions

<!--
Delete this block once every question is answered. While it is here, the spec
is not ready to implement and no code should be written from it.
-->

- **Q1. Is this one capability or two?** Swapping chat-time connectors to
  Google's servers, and using Workspace as a knowledge-base source, are useful
  without each other and fail for different reasons. The brief bundles them.
  Split, or keep as one?
- **Q2. Does Developer Preview disqualify production use?** All eight servers
  are labelled Developer Preview. Our Google connectors serve paying
  organisations today. Is a preview dependency acceptable behind a flag, or not
  at all until GA?
- **Q3. What happens to Analytics and Ads?** Google publishes no MCP server for
  either, and `ragen-connectors` serves both. So this is at most a partial
  replacement — do we run both surfaces, or keep everything where it is?
- **Q4. One Google grant or two?** Ours holds tokens in the Token Vault
  (ADR-32) under a per-user `customer_id`. Google's servers take an OAuth
  client of ours and consent per user, per product — up to eight authorisations
  where there is one today. Does that go through the vault unchanged, and is
  the consent burden acceptable to an admin rolling this out?
- **Q5. Does the knowledge-base path move at all?** Drive's tools are
  `search_files` and `read_file_content` — per file. The importer lists up to
  200 files through a REST endpoint on our connector and then fetches content.
  Is a per-file MCP tool call an acceptable shape for bulk ingest, or does that
  path stay ours regardless of what happens to chat?

## Problem

<!-- What someone cannot do today, with evidence. Written after the questions
     above are answered — the answer to Q1 decides whether this section
     describes one problem or two. -->

## What is already true

Written down first because the brief reads as greenfield and is not.

| Capability | Today | Google's equivalent |
| --- | --- | --- |
| Drive, Calendar | `ragen-connectors`, our OAuth + PKCE | `drivemcp`, `calendarmcp` |
| Analytics, Ads | `ragen-connectors` | **none published** |
| Gmail | Claude AI MCP | `gmailmcp` |
| Docs, Sheets, Slides, Chat, People | — | five servers, no equivalent here |
| Drive folder → knowledge base | REST `/drive/folder/:id/files`, `UserFile`, S3, Temporal in batches of 5 | no bulk listing documented |

## Out of scope

<!-- Candidate: the reverse direction (apps/mcp, ADR-36). Confirm once Q1 is
     answered. -->

## Proposed solution

<!-- Blocked on Q1–Q5. -->
