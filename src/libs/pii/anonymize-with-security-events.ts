import { presidioClient, type AnonymizeResult } from './presidio-client';
import { recordSecurityEvent } from '@/features/security/services/commands/record-security-event-command';

const PLACEHOLDER_PATTERN = /<([A-Z_]+)_\d+>/;

function deriveEntityCounts(aliasMap: Record<string, string>): {
  entityTypes: string[];
  entityCounts: Record<string, number>;
} {
  const entityCounts: Record<string, number> = {};
  for (const placeholder of Object.keys(aliasMap)) {
    const entityType = placeholder.replace(PLACEHOLDER_PATTERN, '$1');
    entityCounts[entityType] = (entityCounts[entityType] ?? 0) + 1;
  }
  return { entityTypes: Object.keys(entityCounts), entityCounts };
}

/**
 * PII masking is opt-in — most deployments don't need it, and requiring a
 * running Presidio analyzer just to send a chat message is the kind of
 * default that turns a 15-minute local setup into a multi-service Docker
 * build. Set FEATURE_FLAG_PII_MASKING=1 for deployments in regulated
 * industries that actually need it.
 */
export function isPiiMaskingEnabled(): boolean {
  return process.env.FEATURE_FLAG_PII_MASKING === '1';
}

/**
 * Wraps `presidioClient.anonymize()` and records a `CHAT_PII_DETECTED`
 * (info) or `CHAT_PII_MASKING_FAILED` (warn) security event so admins can
 * monitor PII exposure and analyzer outages from the incidents dashboard.
 *
 * When PII masking is disabled (the default — see `isPiiMaskingEnabled`),
 * this is a no-op that returns the original text unmasked; Presidio is
 * never called and there is nothing to fail closed on.
 *
 * When enabled, re-throws on analyzer failure: callers must fail closed so
 * unmasked PII never reaches downstream LLM/MCP calls.
 */
export async function anonymizeWithSecurityEvents(
  text: string,
  language: string,
  ctx: {
    orgId: string | null;
    userId: string | null;
    threadId: string;
  },
): Promise<{
  piiResult: AnonymizeResult;
  entityTypes: string[];
  durationMs: number;
}> {
  if (!isPiiMaskingEnabled()) {
    return {
      piiResult: { maskedText: text, aliasMap: {} },
      entityTypes: [],
      durationMs: 0,
    };
  }

  const start = Date.now();
  let piiResult: AnonymizeResult;
  try {
    piiResult = await presidioClient.anonymize(text, language);
  } catch (err) {
    recordSecurityEvent({
      eventType: 'CHAT_PII_MASKING_FAILED',
      severity: 'warn',
      source: 'chat',
      organizationId: ctx.orgId,
      userId: ctx.userId,
      metadata: {
        threadId: ctx.threadId,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
  const durationMs = Date.now() - start;
  const aliasCount = Object.keys(piiResult.aliasMap).length;
  const { entityTypes, entityCounts } = deriveEntityCounts(piiResult.aliasMap);

  if (aliasCount > 0) {
    recordSecurityEvent({
      eventType: 'CHAT_PII_DETECTED',
      severity: 'info',
      source: 'chat',
      organizationId: ctx.orgId,
      userId: ctx.userId,
      metadata: {
        threadId: ctx.threadId,
        aliasCount,
        entityTypes,
        entityCounts,
        maskingDurationMs: durationMs,
      },
    });
  }

  return { piiResult, entityTypes, durationMs };
}
