---
title: 'Brain relation proposals need both endpoint versions'
modules: ['web', 'brain']
areas: ['frontend', 'architecture', 'testing']
topics: ['brain', 'relations', 'proposals', 'concurrency', 'provenance']
---

# Brain relation proposals need both endpoint versions

## Context

Findings offer relation suggestions through the same proposal card and actions as the Brain assistant. Pages citing a shared document provide a bounded suggestion set.

## Problem

A shared source does not prove a relation. Either endpoint can change between rendering a suggestion and applying it. The graph excludes inferred edges by default, so an ordinary neighbourhood link can hide the relations the reviewer just added.

## Rule

Explain the suggestion's basis and begin with nothing selected. Keep confirmed suggestions `INFERRED`; confirmation does not turn them into quoted evidence. Read both endpoints inside the session organization, lock them in a stable order and compare both recorded timestamps before inserting edges. Preserve existing edges with duplicate-safe insertion, invalidate both endpoint versions after a change, and reconcile findings after the transaction. A findings link intended to inspect these relations must explicitly include inferred edges.

## Applies to

Brain findings, assistant proposals and graph neighbourhood links.
