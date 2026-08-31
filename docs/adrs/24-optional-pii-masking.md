# ADR-24: PII Masking Is Opt-In

**Status:** Accepted
**Date:** 2026-08-31

## Context

Every chat message passed through Microsoft Presidio for PII masking before reaching the LLM. `assistant-stream.ts` called `anonymizeWithSecurityEvents()` unconditionally, which called `presidioClient.anonymize()`, which required `PRESIDIO_ANALYZER_URL` to point at a running analyzer. The call is **fail-closed**: if the analyzer is unreachable it throws, a `CHAT_PII_MASKING_FAILED` security event is recorded, and the message is not sent. That is the correct behaviour for masking that is supposed to be there — unmasked PII must never silently reach a model.

The problem was that this made Presidio a hard dependency of the core product for everyone:

1. **Chat did not work at all without it.** A developer or self-hoster who skipped the two Presidio containers got a failure on their first message, with the cause several layers down.
2. **It costs two containers** (`presidio-analyzer`, `presidio-anonymizer`), and the analyzer is a slow-starting Python service with a 60-second healthcheck start period. `docker-compose.app.yml` doesn't include them at all.
3. **Most deployments do not need it.** PII masking before an LLM call is a requirement in heavily regulated industries. For everyone else it is latency and operational weight in exchange for a guarantee they were not asked to make.
4. **`.env.example` documented it as required** ("Presidio PII masking (required — fail-closed when unavailable)"), so there was no signal that it could be turned off — because it couldn't.

There is an existing, and **different**, PII configuration axis: `piiPolicy` / `piiIngestionMode`, set per organization and per file, controlling how strict masking is _at document ingestion time_. It assumes Presidio exists. It is not, and was never, a switch for whether Presidio runs at all.

## Decision

### 1. A deployment-level feature flag, defaulting to off

`FEATURE_FLAG_PII_MASKING=1` enables chat PII masking. Unset — the default — `anonymizeWithSecurityEvents()` returns the original text with an empty alias map and no entity types, calls no external service, and records no security event.

This follows the existing convention in the codebase (`FEATURE_FLAG_RERANKING`, `FEATURE_FLAG_MULTI_QUERY`, `FEATURE_FLAG_BUILT_IN_TOOLS`): `process.env.FLAG === '1'`, checked at the point of use.

### 2. Off by default, not on by default

The alternative — default on, with a flag to disable — keeps the stricter posture but keeps the onboarding problem: a fresh clone still fails on the first message. Defaulting to off makes the product work out of the box and makes enabling masking a deliberate act by a deployment that knows it needs it.

The trade is stated plainly: **the default configuration does not mask PII before sending it to the LLM.** That was already true for anyone who couldn't run Presidio; it is now true visibly and by choice rather than as a failure mode.

### 3. When enabled, behaviour is exactly as before

The flag gates whether masking runs, not how strictly. With it on, Presidio is a hard dependency again and the call still fails closed — the security guarantee for deployments that opt in is unchanged.

### 4. The two axes stay separate

`FEATURE_FLAG_PII_MASKING` answers "is Presidio used at all in this deployment". `piiPolicy` / `piiIngestionMode` answer "how strict is ingestion-time masking for this org/file". They are not merged: one is an operator/infrastructure decision, the other a per-tenant product setting.

### 5. `.env.example` is rewritten to match

The Presidio block is commented out and labelled optional, noting that enabling it makes the analyzer a hard dependency and that the service comes from `docker-compose.yml`.

## Consequences

### Positive

- **Ragen runs without Presidio.** Two containers and a slow healthcheck drop off the critical path for local development and for self-hosters who don't need masking.
- **The failure mode is gone.** No more first-message failure with a cause buried several layers down.
- **Regulated deployments are unaffected** when they set the flag: same fail-closed guarantee, same security events.
- **The configuration surface is honest** — `.env.example` no longer claims a required dependency that most deployments don't want.

### Negative

- **The default is less strict than before.** A deployment that _should_ mask PII and forgets the flag will send unmasked text to the LLM, silently — there is no warning, because "off" is a legitimate configuration. Deployments in regulated industries must treat this flag as part of their compliance checklist.
- **A security control is now a matter of configuration**, which means it can be misconfigured. Mitigated only by documentation.
- **Two similarly-named PII settings** now exist, and the distinction between them is not self-evident from the names. This ADR and the `.env.example` comment are the mitigation.

## Key files

| File                                               | Purpose                                              |
| -------------------------------------------------- | ---------------------------------------------------- |
| `src/libs/pii/anonymize-with-security-events.ts`   | `isPiiMaskingEnabled()` and the early-return no-op   |
| `src/libs/pii/presidio-client.ts`                  | The Presidio HTTP client (unchanged; fail-closed)    |
| `src/app/api/threads/services/assistant-stream.ts` | The only production call site                        |
| `.env.example`                                     | Documents the flag and the optional Presidio block   |
| `docker-compose.yml`                               | `presidio-analyzer` / `presidio-anonymizer` services |
