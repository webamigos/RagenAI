---
title: '`isBinary(path)` reads only the extension, so a DOCX was ingested as text — and the workflow suite, which mocks the check, could not see it'
modules: ['worker', 'web', 'rag-core']
areas: ['rag', 'testing']
topics: ['ingest', 'binary-detection', 'istextorbinary', 'file-type', 'docling', 'mocks', 'false-green', 'temporal', 'workflow-sandbox']
---

# `isBinary(path)` reads only the extension

**Context**: `runFileEmbeddings` starts by asking `checkIsBinaryFile` whether
the upload is binary. Only a binary goes through `checkMimeType` (magic bytes
via `file-type`); anything else is recorded as `text/plain`, and the mime
decides the `FileType` the rest of the pipeline dispatches on. Docling is tried
first for most types; when it fails and `DOCLING_STRICT` is unset, the handler
falls back to the legacy loader for that `FileType`.

**Problem**: the check was `isBinary(filePath) ?? false`. `istextorbinary`
given a name and no buffer consults its two extension lists and nothing else —
and `docx`, `xlsx`, `pptx` and `epub` are on neither. It answered `null`, which
became "text". So a Word file was recorded as `TEXT` (overwriting `DOCX` on the
row), and on a Docling outage the TEXT fallback, `readFile(path, 'utf-8')`, read
the ZIP and indexed it. On demo the chat quoted three `.docx` sources as lines
of U+FFFD. EPUB was affected even with Docling up, because Docling does not
handle it and the fallback ran every time.

Nothing was red, for a reason worth more than the bug: `workflow.spec.ts` runs
the real handler against **mocked activities**, and `checkIsBinaryFile` is one
of them. Every test that wanted a binary said `mockResolvedValue(true)` by
hand, so the suite tested the dispatch *given* a correct answer and never asked
whether the answer was correct. The detection function itself had no test.

Two more things turned up while fixing it:

- `checkMimeType` read the first 4100 bytes and called `fileTypeFromBuffer`.
  For a ZIP, `file-type` walks the entries; when the identifying one is not in
  that window it runs off the buffer and throws `EndOfStreamError`, which the
  activity's `catch` turned into `null` — "Cannot detect mime type" for a valid
  Office file. It reads the file now (`fileTypeFromFile`), and a ZIP it cannot
  name is narrowed by extension among docx/xlsx/pptx/epub only.
- The new safety net lives in `@ragenai/rag-core` so the web app can use it
  too. Importing the package's barrel into the handler failed **every** workflow
  test with `process is not defined`: the handler is bundled into Temporal's
  workflow sandbox, and the barrel's `vector-contract` reads `process.env` at
  module load. The handler imports the `./undecodable-text` subpath, which
  imports nothing.

**Rule**:

- Pass `istextorbinary` a buffer and `null` as the name when the question is
  about content. With a name it trusts the name first, and with a name alone it
  answers from the name only — `null` is "I did not look", not "text".
- An activity that is mocked in the workflow suite needs its own test against
  real inputs. A mocked step is an assumption the suite makes on your behalf;
  list them, and make sure each one is tested somewhere it is not mocked.
- Anything a loader produces is checked before it is indexed:
  `findUndecodableText` refuses a leading ZIP/PDF signature, a U+FFFD share
  above 1 %, or a control-character share above 1 %. The next route a binary
  finds to a text loader then fails the ingest instead of filling the index.
- A module the worker's handlers import must be safe in a sandbox with no
  `process` — prefer a subpath with no imports over a package barrel.

**Applies to**: `apps/worker/src/activities/files/`, `apps/worker/src/handlers/`
(anything bundled into Temporal workflows), `packages/rag-core`, and any suite
that runs a real pipeline over mocked steps.
