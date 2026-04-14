# Chatbot feature — integration follow-ups

This branch (`feat/embeddable-chatbot`) was built against an older `dev`
and merged back in on 2026-04-14. The merge picked up RAG pipeline
improvements, thread encryption, the ragen-api split, security events,
and audit logging. The core feature works, and the P0 leak risks have
been fixed (see below), but the items here remain before the feature
should ship to paying customers.

## Landed in the merge

- **accessible_by filter** in `POST /api/chatbot/[token]/chat` — when
  `selectedFileIds` is empty, the chatbot now retrieves only org-wide
  documents (`metadata.accessible_by match_any ['org:<id>']`), matching
  the non-admin path in `buildMetadataFilter`. Previously it retrieved
  everything in the org including user/team-private files.
  See `src/app/api/chatbot/[token]/chat/metadata-filter.ts`.
- **Rate limiting** on the public chat endpoint — Redis-backed, two
  buckets (per widget token + per widget token × IP), 60-second window.
  Tunable via `CHATBOT_RATE_LIMIT_TOKEN_PER_MIN` and
  `CHATBOT_RATE_LIMIT_IP_PER_MIN`. Fails open when Redis is unavailable.
  See `src/app/api/chatbot/[token]/chat/rate-limit.ts`.
- **Admin pages moved** from `/settings/chatbots/*` to
  `/organization/chatbots/*`, inheriting the org-admin access guard
  from `OrganizationLayout`. Nav entry added to `OrganizationNav`,
  `settingsChatbots` route helper renamed to `organizationChatbots`.

## P0 — before exposing to real customer traffic

### 1. `getChatbotFiles` bypasses per-file permissions
`src/app/[locale]/(panel)/organization/chatbots/actions.ts:44` calls
`getAllOrgFilesQuery(orgId, [], { isOrgAdmin: true })` for any
authenticated org member. The `isOrgAdmin: true` bypass means a regular
member creating a chatbot can see and expose files they are not a
member/owner of. After moving the pages under `/organization` the
`OrganizationLayout` guard blocks non-admins from the *pages*, but the
server actions are still callable directly — fix by fetching only the
files the calling user can actually access (preferred), or add an
explicit admin guard in the action.

### 2. Restrict chatbot actions to org admins
`organization/chatbots/actions.ts` uses `getOrgIdFromAuthOrThrow` (any
org member). The layout guard now blocks non-admin page rendering, but
the server actions remain directly callable. Replace the helper with
`requireOrgAdmin()` from `src/lib/auth-guards.ts` inside each action so
the protection matches the admin-only UX.

### 3. Validate `selectedFileIds` belong to the org
`create-chatbot-command.ts:14` and `update-chatbot-command.ts` accept
the IDs as-is. If a member passes another org's file ID (or an ID
they cannot access), it lands in `chatbots.selected_file_ids` without
a check. The retrieval filter would happily look those up. Add a
membership check in the command.

## P1 — before general availability

### 4. Langfuse tracing
The chatbot chat route bypasses `updateActiveTrace(...)` entirely.
Public chatbot conversations don't show up in Langfuse. Copy the
pattern from `src/app/api/threads/services/assistant-stream.ts:480-494`,
omitting input/output when `isEncryptionEnabled()`.

### 5. AI usage tracking
`trackAiUsage(...)` is never called for chatbot completions, so LiteLLM
budget and per-org quotas don't include them. An org with a public
chatbot has effectively unlimited LLM cost from that surface. Same
pattern as `assistant-stream.ts:815-826`.

### 6. Friendly budget-exceeded message
When LiteLLM returns a budget-exceeded error, the chatbot stream
currently calls `controller.error(err)` — widget users see a blank
response. Translate to a readable message like the chat endpoint does.

### 7. HMAC-signed session tokens
Today `visitorId = client-supplied sessionId`. A visitor whose
sessionId leaks (unlikely given it lives in localStorage and never
appears in URLs) could have their thread read by someone else on the
same chatbot. Defense-in-depth fix: server issues an HMAC-signed token
on thread creation (SSE event), widget stores + resends, server verifies.
See the audit discussion on feat/embeddable-chatbot dated 2026-04-14.

## P2 — polish

### 8. Jailbreak classifier
`classifyJailbreakRisk(...)` is fire-and-forget in `assistant-stream.ts`
and feeds the security dashboard. Public chatbots are the most exposed
jailbreak surface — consider enabling.

### 9. SecurityEvent recording
CORS rejections, 429s, invalid tokens, origin mismatches are currently
only logged via Pino. Record them via `recordSecurityEvent()` so
admins see chatbot abuse in the security dashboard.

### 10. Ordering of USER + ASSISTANT saves
`src/app/api/chatbot/[token]/chat/route.ts` saves both messages via
`Promise.all` after the stream completes. Since `createdAt` has ms
precision and the calls are concurrent, the order can flip on fast
streams. Sequence them or set explicit timestamps.

### 11. Empty-response guard
If the LLM returns an empty string (e.g. moderation refusal), the
route still saves an empty assistant message. Skip the save when
`fullResponse.trim()` is empty.
