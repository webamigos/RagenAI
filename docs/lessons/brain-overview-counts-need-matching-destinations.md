---
title: 'Brain overview counts need the same scope as their destination lists'
modules: ['web', 'brain']
areas: ['frontend', 'architecture', 'testing']
topics: ['brain', 'counts', 'filters', 'languages', 'navigation']
---

# Brain overview counts need the same scope as their destination lists

## Context

The Brain overview links document coverage, review stages and open findings to existing lists.

## Problem

Global page totals cannot be summed from per-file counts: a page citing two documents belongs to both files. A document with a stale or rejected page is not a zero-page document. PublishedAt is also an independent predicate, whereas the pages list normally excludes rejected pages. Its default predicate would silently narrow a timestamp-based published count. The existing finding query accepted a type, but its route did not forward the URL parameter.

## Rule

Count global pages directly, keep distinct file/page coverage for document bars, and count zero-page files against all source rows. Pass the same organization and document-language scope to every metric and destination. Validate URL filters, apply them to both rows and total, and preserve them through search, pagination and fragment links. Never rely on a default list predicate when a summary count explicitly uses another one. Verify the link's resulting list in a smoke test, not just its href in a mock.

Phase 5 also distinguishes coverage from extraction outcome: a completed embedding with zero approved/candidate pages does not prove a finished, empty extraction. Read all-status sources and the open `EXTRACTION_FAILED` finding; only `nothing_extracted` without any sources proves that state. Keep indexing/withdrawal labels separate from extraction evidence.

## Applies to

Brain overview, document coverage, publication summaries and attention links.
