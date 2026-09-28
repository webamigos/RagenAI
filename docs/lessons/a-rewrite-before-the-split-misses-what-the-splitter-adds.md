---
title: A rewrite applied before the split misses what the splitter adds, and a per-document value copied by the splitter becomes every chunk's
modules: [worker]
areas: [security, rag]
topics: [pii, presidio, masking, dual-content, chunking, docling, table-chunks, encryption]
---

## Context

Ingest masked PII with `maskPii` on the parsed documents (`rawDocs`) and
attached the encrypted original with `applyDualContentMode`. Both ran before
`splitText`. With Docling, `rawDocs` is one document per file.

## Problem

Both problems were found while researching a spec, on 2026-09-29. Neither was
found by a test.

- **Table chunks were never masked.** Docling's table chunks are built by the
  splitter from `metadata.doclingTables`, the parser's structured tables, and
  not from the prose `maskPii` rewrote. Every table went unmasked into:
  - the index;
  - the summary prompt;
  - the RAG score prompt;
  - the stored document.
- **`dual_content` gave every chunk the whole document.** The encrypted
  original was attached to the raw document. The splitter copies a document's
  metadata onto each chunk cut from it (`{ ...doc.metadata }`), so every chunk
  of a file carried the whole file as its `content_original`. Two things
  followed:
  - the dense embedding, which reads the decrypted original, embedded the
    document's first 2000 characters for every chunk;
  - the query-time decode put the whole document back in place of each chunk
    it returned.

## Rule

**A transformation that has to hold for every chunk runs on the chunks.**
Masking, encrypting an original, and anything similar belong after
`splitText`. Before the split, they miss text the splitter creates from
metadata. A per-document value set there is also copied onto every chunk,
where it no longer describes the chunk.

The fix splits the unmasked text, then masks the chunks and attaches each
chunk's own original. Splitting the original text also keeps Docling's page
anchors, which are offsets into it, pointing at the right characters.

## Applies to

`apps/worker/src/handlers/parse-and-embed.ts` and any new ingest path.
`reindexDocumentVersion` and `scrapeWebsite` do not mask at all, which is
their own defect, not this one.
