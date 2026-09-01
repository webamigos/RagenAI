# Thread Message Encryption

Split out of `AGENTS.md` to keep it under Codex's 32,768-byte `project_doc_max_bytes` budget. Reached from that file's Task Router.

Message content encrypted at rest via **AWS KMS envelope encryption** (AES-256-GCM). Thread titles stay plaintext for search.

- Per-thread DEK via KMS `GenerateDataKey`. Encrypted DEK stored in `Thread.encryptedDek` (base64). Per-request DEK cache minimizes KMS calls.
- **Env gating**: no `AWS_KMS_KEY_ID` → encryption disabled (local dev stays plaintext). Uses existing `AWS_*` credentials.
- Key files: `src/libs/crypto/thread-encryption.ts`, `src/libs/crypto/decrypt-messages.ts`, `src/features/messages/services/commands/create-message-command.ts` (race-safe conditional update), `src/features/threads/services/commands/encrypt-threads-command.ts`, `src/app/actions/encrypt-threads.ts`.
- **Langfuse**: when encryption enabled, `input`/`output` omitted from traces (only tags, sessionId, model).
- **Search trade-off**: `searchAllQuery` skips content matching for encrypted threads — title matches only.
- **Admin migration**: `encryptAllThreadsAction()` (app admin only) — idempotent, resumable.
