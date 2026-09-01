# Knowledge Base

Split out of `AGENTS.md` to keep it under Codex's 32,768-byte `project_doc_max_bytes` budget — content past that offset is silently dropped. Reached from that file's Task Router.

Nested folders, per-user file ownership, sharing with users/teams.

**Data model**:
- `DocumentFolder`: `Int` `id` + UUID `publicId`. Self-referential via `parentId` + materialized `path` column (e.g. `/1/5/12/`). Optional `teamId`, `ownerId`.
- `UserFile`: `ownerId` (nullable for legacy org-wide) + `folderId`.
- `DocumentPermission`: grants access to files or folders for users/teams via optional FKs (`filePublicId`, `folderId`). Levels: `'view'`, `'full'`. Folder permissions cascade via `path LIKE`.

**Visibility rules**: `ownerId = null` → all org members (legacy). `ownerId = userA` → owner + org admins + explicit shares. Folder with `teamId` → team members + org admins. UI views: All Files / My Files / Shared with me.

**Vector store access filtering**: each chunk has `metadata.accessible_by: string[]` (`org:<id>`, `user:<id>`, `team:<id>`). RAG queries add this filter for non-admins; org admins bypass. Filter built in `src/app/api/threads/services/initializeBasicRag.ts`. Sync command: `sync-vector-permissions-command.ts`. Backfill script: `src/scripts/backfill-accessible-by.ts`.

**Key files**: `src/features/documents/` (contracts + commands), `src/features/documents/utils/folder-tree.ts` (`buildFolderTree()`), `src/app/actions/folders.ts` + `permissions.ts`, UI under `src/app/components/ManageKnowledge/Folders/` and `src/app/[locale]/(panel)/knowledge/documents-list/`.

**Upload with folder context**: `/api/upload` accepts optional `folderId` in FormData; files created with `folderId` + `ownerId`.
