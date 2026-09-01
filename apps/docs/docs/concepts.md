---
sidebar_position: 5
---

# Concepts

Key concepts to understand when working with Ragen AI.

## Projects (Assistants)

A **project** (also called an **assistant** in the API) is a self-contained knowledge base. It has:

- **Documents** — Files you upload (PDF, DOCX, Markdown, CSV, XLSX, images, URLs, and more)
- **Instructions** — Custom system prompts that define how the AI should behave for this project
- **Assistant ID** — Used in API requests to specify which project to query (`assistant_id` field)

When a user asks a question through the API, the AI searches the project's document collection for relevant information and uses it to generate an answer.

### Document processing

When you upload a document to a project:

1. The file is uploaded to secure cloud storage
2. A background worker parses the content and splits it into chunks
3. Each chunk is converted to a vector embedding
4. Embeddings are stored in a vector database for fast similarity search

Supported file types: **PDF**, **DOCX**, **EPUB**, **Markdown**, **TXT**, **CSV**, **XLSX**, **SRT** (subtitles), **Images** (JPG, PNG, WebP), and **URLs**.

## Organizations

An **organization** is the top-level container. It holds:

- **Members** with role-based access (owner, admin, member)
- **Projects** with their own knowledge bases
- **API keys** for programmatic access
- **Connectors** to external services (Google Drive, HubSpot, etc.)

## Retrieval Augmented Generation (RAG)

Ragen uses RAG to ensure AI responses are grounded in your actual documents:

1. **Retrieval** — When a question is asked, the system finds the most relevant document chunks using vector similarity search
2. **Reranking** — Retrieved chunks are reranked using a cross-encoder model (Cohere Rerank) for better precision
3. **Generation** — The AI model receives the relevant chunks as context and generates an answer based on them

This approach prevents hallucination and ensures answers cite your real data.

## Access control

### Document visibility

| Scenario | Who can see |
|----------|-------------|
| Organization-wide file (no owner) | All organization members |
| User-owned file | File owner + org admins + explicit shares |
| Team folder | Team members + org admins |
| Shared file/folder | Users and teams with explicit permissions |

### API key scope

An API key is bound to one organization and one default project.
How that boundary applies depends on the operation:

| Surface | Scope | Notes |
|---------|-------|-------|
| `POST /v1/chat/completions`, `POST /v1/chat` | Project | Retrieval is against the bound project's knowledge base. |
| `POST /v1/files`, `GET/DELETE /v1/files[/:id]` | Project | Files are owned by the bound project. |
| `POST/GET/PATCH/DELETE /v1/assistants[/:id]` | Organization | `client.assistants.list()` returns every project in the org. Self-delete of the key's bound project is rejected. |
| `POST/GET/PATCH/DELETE /v1/threads[/:id]` + messages | Organization | `client.threads.list()` returns every thread in the org. Create without `assistant_id` uses the bound project as the default. |

The key never crosses its organization boundary — cross-org access is
always rejected.

### Debug mode

Each API key has an optional **debug mode** toggle (off by default).
When enabled, every API request made with that key automatically creates
a **thread** in the project view with the full conversation
(user message + assistant response). These threads appear under the
**API threads** tab in the project page.

This is useful when building and testing integrations — you can inspect
exactly what the API received and responded without adding logging to
your own code.

:::info Storage impact
Debug mode saves every API conversation to the database. This increases
storage usage on your account. Disable it once your integration is
stable to avoid unnecessary data accumulation.
:::

To toggle debug mode:

- **During key creation** — check the "Debug mode" checkbox in the
  create dialog
- **After creation** — use the "Debug mode" toggle in the API keys
  table