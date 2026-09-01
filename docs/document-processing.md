# Document Processing

Split out of `AGENTS.md` to keep it under Codex's 32,768-byte `project_doc_max_bytes` budget. Reached from that file's Task Router.

Upload → S3 → Temporal worker (`apps/worker`) → parse → embed → store in Qdrant. Status via `ParsingStatus`/`EmbeddingStatus` enums.

**File types** (`FileType` enum: `PDF`, `EPUB`, `DOCX`, `SRT`, `TEXT`, `MARKDOWN`, `URL`, `IMAGE`, `CSV`, `XLSX`):
- **PDF**: worker uses Claude native PDF (base64 to Claude in single call). `PDF_PROCESSOR=claude|vision`, `PDF_MODEL`. **`claude-haiku-4-5` is commented out in `litellm/config.yaml`** — pointing `PDF_MODEL` at it 404s at the proxy. Use an enabled model or re-enable it there first. Chat: attached as binary data URL.
- **DOCX**: `mammoth` (client-side in chat, worker-side for KB).
- **Image** (jpg/png/webp/gif): chat uses multimodal vision LLMs w/ lightbox; KB describes via vision LLM then embeds.
- **XLSX/XLS**: SheetJS → CSV (client for chat, worker for KB).
- **CSV/TXT/Markdown**: read as plain text (5MB CSV limit in chat).
- **SRT**: worker uses LLM to chunk into meaningful segments.
- **EPUB**: binary upload, worker text extraction.
