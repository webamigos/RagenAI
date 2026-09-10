---
title: 'A field whose name misdescribes its contents outlives every comment warning about it'
modules: ['web', 'worker']
areas: ['architecture', 'rag']
topics: ['metadata', 'naming', 'vector-store', 'architecture-tests', 'billing']
---

# A field whose name misdescribes its contents outlives every comment warning about it

**Context**: chunk metadata in Qdrant carried `page_number`, written by two
places in two different apps as `index + 1` — the chunk's ordinal within its
file. The design brief for the sources block asked for `{file} · page {n}`, and
`page_number` is what a reader reaches for.

**Problem**: a twelve-page PDF split into forty chunks reports "page 37". The
value is not wrong; the *name* is, and the name is what the next person builds
on. Nobody misreads a comment they never open — they read the field name in an
autocomplete list and use it.

The cost compounded in a direction nobody looked. Tracing the same area turned
up `pageCount` on `UserFile`, which **feeds usage limits**, computed as
`Math.ceil(totalChars / 3000)` for every Docling-parsed file. The workflow said
so in its own comment — "PDF (Docling): char-based estimate (no pdf-parse
metadata available)" — so the estimate was documented, deliberate, and had
quietly become the default path when Docling became the default parser. A fixed
density assumption overcounts dense text and undercounts a page that is mostly
table or image, and customers are charged against it. The real page count was
in the same Docling response the whole time; the client asked for markdown only.

**Rule**: rename the field. A field whose name states what it holds cannot be
rendered under the wrong word by the next person who finds it, and that is a
stronger guarantee than any comment. When the true value is not available yet,
ship the rename anyway and let the honest UI show nothing — `chunk_index` plus
an absent `source_page` beats `page_number` plus a plausible number.

Then guard it. Re-adding the old name is a one-word change that typechecks,
passes every unit test, and reinstates the trap — and it cannot be caught by
reading a diff when the writers live in different apps.
`tests/architecture/chunk-metadata-has-no-page-number.test.ts` is that guard.

And when a field is an estimate, check who is *paying* for it. A number that
only feeds a UI can be approximate; the same number feeding a limit is a
billing input, and "documented estimate" is not the same as "acceptable
estimate". Where the exact value is already being fetched and discarded, the
estimate is not a trade-off — it is an oversight with a comment on it.

**Applies to**: chunk and file metadata written by `apps/worker` or
`apps/web`'s ingest paths; anything that labels a stored number in the UI;
anything feeding `pageCount` or another usage limit.
