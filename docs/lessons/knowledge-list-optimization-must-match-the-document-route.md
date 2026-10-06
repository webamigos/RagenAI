---
title: 'Knowledge-list optimization must match the document route'
modules: ['web', 'documents']
areas: ['frontend', 'architecture', 'testing']
topics: ['knowledge', 'optimization', 'diagnostics', 'authorization', 'bulk-actions']
---

# Knowledge-list optimization must match the document route

## Context
The Brain handoff requested an optimization action for headerless tables, including spreadsheets. The existing prose optimizer deliberately rejects spreadsheets and mostly tabular documents.

## Problem
A bulk optimization button offered for every warning would call a route that rejects spreadsheets and mostly tabular documents. Missing diagnostic reports could also be mislabeled as healthy.

## Rule
Use the same `canOptimizeDocument` predicate as the guarded route. Offer reprocessing for tabular files, confirm suggestion jobs and retry only failed requests. A warning does not make a file eligible for every repair action. Reuse the domain capability check and preserve unsupported states. Missing diagnostics means “not checked”, not “OK”. Brain coverage must be read only for file IDs already returned by the access-scoped listing and only when the actor can use Brain.

## Applies to
Knowledge-base summaries, chat-quality cells, bulk optimization and optional Brain coverage.
