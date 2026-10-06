---
title: 'Brain citations are not pages, and publication completion must reach the mounted screen'
modules: ['web', 'worker', 'brain-core']
areas: ['frontend', 'architecture', 'testing']
topics: ['brain', 'counts', 'citations', 'publication', 'async-state']
---

# Brain citations are not pages, and publication completion must reach the mounted screen

## Context

Brain stores one KnowledgePageSource row per quote. Publication writes the page's timestamp before the worker indexes its file, then the worker marks that file COMPLETED.

## Problem

Grouping citation rows by file and counting pageId counted quotes: three quotes from one approved page appeared as three approved pages. Separately, PublicationControls received publishing once and never refreshed the mounted screen after the worker completed. A local STARTED → COMPLETED reproduction kept “Zapisywanie…” until a full page reload, even though getKnowledgePageQuery returned published on a fresh read.

## Rule

Count distinct (fileId, pageId) pairs per status. A page citing two files counts once for each, so per-file totals need not equal the global page total. Test source rows that actually reproduce duplicate counts. While publication is pending, refresh the server state; stop when it changes or the component unmounts. Never infer completed indexing from publishedAt alone.

A finished extraction with no resulting pages must retain an actionable failure. Embedding completion alone does not prove extraction ran. Historical repair can use resolved extraction findings as evidence and must respect dismissals.

## Applies to

Brain Documents counts, PublicationControls, extraction persistence and findings reconciliation. Sparse spreadsheets must remain undetected when language evidence is insufficient; the schema has no organization default language.
