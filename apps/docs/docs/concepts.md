---
sidebar_position: 6
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

- **Members**, each with an [organization role](#two-kinds-of-administrator) — owner, admin or member
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

### Two kinds of administrator

"Admin" means two unrelated things in Ragen, and confusing them is the most
common way to misread what someone can do. They are separate fields on
separate tables, and neither implies the other.

|            | Organization role                                      | Platform role                                        |
| ---------- | ------------------------------------------------------ | ---------------------------------------------------- |
| Stored as  | `Member.role`, one row per person **per organization** | `User.role`, one row per person                      |
| Values     | `owner`, `admin`, `member`                             | `admin`, `user`                                      |
| Scope      | one organization                                       | the whole installation                               |
| Granted by | that organization's owner or admin                     | another platform administrator, from the admin panel |
| Reaches    | **Organization** in the main app                       | the [admin panel](/docs/admin-panel), a separate app |

Someone can be an organization owner and have no platform role at all — that
is the normal case, and it is what every customer account looks like. Someone
can be a platform administrator and not belong to the organization they are
looking at, which is what makes incident response possible.

**What each organization role may do:**

|                                                                                          | member | admin | owner |
| ---------------------------------------------------------------------------------------- | ------ | ----- | ----- |
| Use assistants, upload to their own knowledge base                                       | ✓      | ✓     | ✓     |
| See every document in the organization, not only their own and what was shared with them |        | ✓     | ✓     |
| Invite and remove members, change roles, edit organization settings                      |        | ✓     | ✓     |
| Transfer or delete the organization itself                                               |        |       | ✓     |

`admin` and `owner` are the same permission set apart from that last row —
they differ in who may dispose of the organization, not in what they can see
or manage day to day.

**What the platform role adds** is a different question, not a bigger version
of the same one: usage across every organization, disk ceilings, revoking
somebody else's API key, banning an account, the activity log. It does not
grant membership anywhere, so it does not by itself let anyone read another
organization's documents through the app. See
[Admin panel](/docs/admin-panel) for the full surface and for what is
deliberately absent from it.

### Document visibility

| Scenario                          | Who can see                               |
| --------------------------------- | ----------------------------------------- |
| Organization-wide file (no owner) | All organization members                  |
| User-owned file                   | File owner + org admins + explicit shares |
| Team folder                       | Team members + org admins                 |
| Shared file/folder                | Users and teams with explicit permissions |

### API key scope

An API key is bound to one organization and one default project.
How that boundary applies depends on the operation:

| Surface                                              | Scope        | Notes                                                                                                                         |
| ---------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/chat/completions`, `POST /v1/chat`         | Project      | Retrieval is against the bound project's knowledge base.                                                                      |
| `POST /v1/files`, `GET/DELETE /v1/files[/:id]`       | Project      | Files are owned by the bound project.                                                                                         |
| `POST/GET/PATCH/DELETE /v1/assistants[/:id]`         | Organization | `client.assistants.list()` returns every project in the org. Self-delete of the key's bound project is rejected.              |
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
