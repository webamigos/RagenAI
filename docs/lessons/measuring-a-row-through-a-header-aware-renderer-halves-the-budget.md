---
title: A packer that measures one row through a header-aware renderer charges every row for a separator no chunk contains
modules: [worker]
areas: [rag, architecture]
topics: [chunking, tables, packrows, markdown, budget, silent-mis-sizing, adr-43, adr-20]
---

## Context

`packRows` is the shared "repeat the header, pack to the budget" loop behind
both the CSV row-group splitter and ADR-43's table chunker. It sizes chunks on
*rendered* output rather than on rows, because only the caller knows how a row
becomes text — the doc comment says so explicitly, and it is the right call.

It measures a single row by calling the caller's `render` with a one-row array.
That is exact for the CSV splitter, whose `render` is a plain per-row
serialiser. The table chunker's is not: `renderPipes(rows, headerCount)` emits
an `| --- |` alignment line under the first `headerCount` rows it is handed, and
the closure passed `Math.min(headerCount, rows.length)` — which is `1` for a
lone body row.

## Problem

Every body row was measured as itself *plus a separator line*. For a
three-column table the measured size of one chunk was 106 characters where the
rendered string was 63 — table chunks packed to roughly half the budget asked
for. Two smaller errors sat on top of it: the header charged a newline the
rows below already charged, and the `[Table n]` caption prepended to every
chunk was not charged to the budget at all, so each finished chunk ran over it.

Nothing failed. The unit tests assert `toBeGreaterThan(1)` and
`toBeGreaterThan(0)` on chunk counts, which is exactly the shape of assertion
that survives a chunker producing twice as many chunks as intended. The
published ADR-43 comparison — the number the "default on" recommendation rests
on — was measured on the mis-sized instrument and had to be re-run.

## Rule

A sizing function borrowed from a renderer is only exact while the renderer is
context-free. When a renderer's output depends on *which* rows it is handed —
headers, separators, captions, a leading placeholder — measuring a fragment
through it measures something the final string does not contain.

Two consequences worth carrying:

- Give the packer an explicit per-row measure when the chunk renderer is
  context-sensitive, and assert the arithmetic: measured size must *equal*
  `render(...).length` for a packed chunk, in every header configuration.
  `toBeGreaterThan` on a chunk count cannot see a factor of two.
- Anything prepended to a chunk after packing — a caption, a heading, a
  placeholder — is part of the chunk and belongs in the budget subtraction
  before packing, not after.

And per ADR-20: a chunking defect found after a comparison is published
invalidates the comparison. Say so where the number lives rather than letting
it be read as current.

## Applies to

`apps/worker/src/services/text-splitters/` — `pack-rows.ts` and both its
callers (`table-chunks.ts`, `csv-row-group-splitter.ts`). More generally, any
splitter that budgets on rendered output.
