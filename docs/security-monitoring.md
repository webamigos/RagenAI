# Security Monitoring Guide

How to set up dashboards, interpret audit events, and tune thresholds for the prompt-injection defense stack (Phases 1–6).

## Audit event types at a glance

| Event type | Source | Default severity | Escalation rule | What it means |
|---|---|---|---|---|
| `AUTH_LOGIN_FAILED` | auth | info | 10 in 60 min → critical | Brute-force attempt |
| `AUTH_BRUTEFORCE_SUSPECTED` | auth | critical | (already critical) | Escalation rule fired |
| `API_INTERNAL_SECRET_MISMATCH` | api | warn | 5 in 10 min → critical | Wrong `x-internal-secret` on `/api/v1/chat` |
| `CROSS_ORG_ACCESS_ATTEMPTED` | auth | warn | 3 in 30 min → critical | Authenticated user tried to access another org's data |
| `UNAUTHORIZED_ACCESS_ATTEMPTED` | auth | warn | 5 in 30 min → critical | User has role but insufficient privileges |
| `API_KEY_CREATED` | admin | info | (no escalation) | Audit trail — key created |
| `API_KEY_REVOKED` | admin | info | (no escalation) | Audit trail — key deleted |
| `TOOL_CALL_BLOCKED` | chat | info | 3 in 10 min → critical | Write tool paused by Phase 2 gating (RAG context present) |
| `TOOL_CALL_CONFIRMED` | chat | info | (no escalation) | User clicked Approve on blocked tool |
| `TOOL_CALL_DENIED` | chat | info | (no escalation) | User clicked Deny on blocked tool |
| `TOOL_ARGS_HIGH_RISK` | mcp | info | 3 in 10 min → critical | Phase 3 inspector found secrets/base64/high-entropy in tool args |
| `CHAT_JAILBREAK_DETECTED` | chat | info | 5 in 10 min → critical | Phase 6 classifier scored user message above threshold |
| `UPLOAD_SUSPICIOUS_CONTENT` | upload | info | 3 in 24 hr → critical | Phase 4 sanitizer flagged prompt-injection patterns in ingested content |
| `RATE_LIMIT_HIT` | infra | info | 20 in 60 min → critical | Redis rate limiter triggered |
| `MCP_OAUTH_FAILED` | mcp | info | (no escalation) | MCP connector OAuth token refresh failed |

## Langfuse dashboard setup

All LLM calls route through LiteLLM which traces to Langfuse automatically. The Phase 6 jailbreak classifier adds per-turn metadata. Here's what to pin:

### 1. Jailbreak score distribution

**Langfuse → Traces → Filter by `functionId: jailbreak-classifier`**

Create a histogram of `metadata.jailbreakScore` across all traces. Expected distribution:
- 95%+ of turns score 0.0–0.2 (normal questions)
- 1–3% score 0.3–0.5 (ambiguous, e.g. users quoting security articles)
- <1% score 0.6+ (genuine probes or false positives)

**Action thresholds:**
- If >5% of daily turns score above 0.5 → the classifier is too sensitive, raise `JAILBREAK_DETECTION_THRESHOLD`
- If genuine attacks consistently score below 0.6 → the classifier prompt needs tuning
- If you see 0 scores everywhere → check that `JAILBREAK_DETECTION_ENABLED=true` is set

### 2. Tool confirmation rate

**Security events table → Filter `eventType IN (TOOL_CALL_BLOCKED, TOOL_CALL_CONFIRMED, TOOL_CALL_DENIED)`**

Track the ratio:
```
confirmation_rate = TOOL_CALL_CONFIRMED / (TOOL_CALL_CONFIRMED + TOOL_CALL_DENIED)
```

- Rate > 90% → users approve almost every blocked call, gating may be too aggressive. Consider narrowing the gate (e.g. only gate when `metadata.suspicious` files are in the retrieved chunks, not all RAG contexts).
- Rate < 50% → users frequently deny, gating is catching real issues. Keep it.
- Rate ~0% with high BLOCKED count → users aren't clicking Approve at all, they're just re-asking. The Phase 2a inline explanation may be sufficient; consider whether Phase 2b's card adds value.

### 3. Suspicious upload rate

**Security events table → Filter `eventType = UPLOAD_SUSPICIOUS_CONTENT`**

Track as % of total uploads per week. Expected:
- <1% for business KB content
- Higher for public-facing URL scrapes (web pages have more noise)

If a specific org has a spike → check what they're uploading. The `metadata.patterns` field in the event tells you which detectors fired (e.g. `ignore-previous`, `system-tag`).

### 4. Tool-arg inspection blocks

**Security events table → Filter `eventType = TOOL_ARGS_HIGH_RISK`**

Track the `metadata.risk` field distribution:
- `medium` (audited, not blocked) — informational, review periodically
- `high` (blocked) — review immediately. Check `metadata.signals` for which detectors fired and `metadata.toolName` for which tool was targeted.

False positive check: if a legitimate user reports a blocked tool call, look up the event by `metadata.toolCallId` and inspect the signals. Common false positives:
- Long meeting descriptions that happen to look like base64
- Security-related discussion where users legitimately paste tokens for analysis

Tune by adjusting the weights in `src/libs/security/tool-arg-inspector.ts` or adding patterns to the explicit-read allowlist.

## Admin panel views

### apps/web — Settings → Security (org admin)

- Scoped to the admin's active organization
- Filters: severity, resolved/unresolved, time period (1d/7d/30d)
- Click a row → detail dialog with metadata JSON, resolve button
- Resolving records the admin's email in `resolvedBy` for accountability

### ragen-admin — Incidents (app admin)

- Global view — all organizations + pre-auth events
- Filters: severity, resolved, period, event type (text input), organization ID
- Detail page: full metadata, user agent, IP, request ID, "Similar events" sidebar (last 10 with same actor + event type)
- Resolve action records the admin's email

## Email alert tuning

| Env var | Default | What it does |
|---|---|---|
| `SECURITY_ALERT_EMAIL` | empty (off) | Comma-separated recipient list |
| `SECURITY_ALERT_FROM` | `Ragen Security <noreply@updates.webamigos.pl>` | From address |
| `SECURITY_ALERT_SEVERITY` | `critical` | Minimum severity to email. Lower to `warn` for broader coverage. |

**Dedupe:** same `(eventType, actor)` within 15 minutes → skipped. Prevents email storms from one attacker hammering one endpoint.

**Rate cap:** max 20 security emails per hour per server process. Above that, events still land in the DB and admin panel, just not emailed.

**Escalation:** most events start at `info` severity. The escalation engine (configured in `src/features/security/utils/escalation-rules.ts`) upgrades to `critical` on bursts. Only critical events (or those at/above `SECURITY_ALERT_SEVERITY`) trigger emails. This means you typically only get emailed when a genuine attack is underway, not on one-off probes.

## Incident response playbook

### "User is probing for jailbreaks"

Signal: 5+ `CHAT_JAILBREAK_DETECTED` events in 10 minutes from one user → escalated to critical → email arrives.

Steps:
1. Open the incident in ragen-admin → Incidents
2. Check "Similar events" sidebar — how many in the last hour?
3. If it's a spike from one user: their session is still active, the defenses are working (Phase 1 context boundaries + Phase 2 tool gating). No immediate action needed unless they're also triggering `TOOL_CALL_BLOCKED` or `TOOL_ARGS_HIGH_RISK`.
4. If you want to stop it: ban the user via ragen-admin → Users → Ban. Better Auth blocks their session.
5. Resolve the incident, noting the action taken.

### "Malicious document in the knowledge base"

Signal: `UPLOAD_SUSPICIOUS_CONTENT` event, amber warning badge on file in KB.

Steps:
1. Open the file in the KB file list — the badge shows which file.
2. Check the event metadata (`patterns` field) — what triggered the flag?
3. If the file is legitimately suspicious (e.g. `ignore-previous` in a non-security-article context): delete the file from the project. The embedded chunks will be cleaned up when the worker processes the deletion.
4. If it's a false positive (e.g. a security whitepaper discussing prompt injection): dismiss the badge by clearing `metadata.suspicious` via a manual DB update. Consider adding the specific pattern to a future allowlist.
5. Resolve the incident.

### "Tool call blocked / args blocked"

Signal: `TOOL_CALL_BLOCKED` or `TOOL_ARGS_HIGH_RISK` events.

Steps:
1. Check `metadata.toolName` — which tool was targeted?
2. Check `metadata.signals` (for arg inspection) — what triggered the block?
3. If it's a real attack (secret pattern in tool args): the defense worked. No further action beyond resolving the incident.
4. If it's a false positive (user legitimately wanted to send a long base64 image as a calendar description): note the pattern and consider adjusting the weight in `tool-arg-inspector.ts` for the next release.

## Threshold reference

| Config | Default | File | What to tune |
|---|---|---|---|
| Jailbreak threshold | 0.7 | env `JAILBREAK_DETECTION_THRESHOLD` | Lower to catch more, raise to reduce FP |
| Tool-arg secret pattern weight | 5 | `src/libs/security/tool-arg-inspector.ts` | Each secret match → instant block. Add/remove patterns here. |
| Tool-arg base64 weight | 3 | same | Lone blob → medium (audit). With high entropy → high (block). |
| Tool-arg entropy threshold | 4.5 | same | Shannon entropy above this + length ≥ 512 chars → signal fires |
| Escalation window/threshold | per-event | `src/features/security/utils/escalation-rules.ts` | `AUTH_LOGIN_FAILED: 10/60min`, `CHAT_JAILBREAK_DETECTED: 5/10min`, etc. |
| Email dedupe window | 15 min | `src/app/emails/services/mailer.ts` | `SECURITY_DEDUPE_WINDOW_MS` constant |
| Email rate cap | 20/hr | same | `SECURITY_RATE_MAX` constant |
