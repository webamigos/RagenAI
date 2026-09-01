import type { SecurityEventSeverity } from '../generated/prisma/client.js';

/**
 * Ported verbatim from ragen-app's
 * src/features/security/utils/severity-threshold.ts. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Numeric rank used for "at least this severe" comparisons. Higher = more
 * severe. Keep this aligned with the Postgres enum declaration order in
 * prisma/schema.prisma (`info < warn < critical`).
 */
const SEVERITY_RANK: Record<SecurityEventSeverity, number> = {
  info: 0,
  warn: 1,
  critical: 2,
};

const DEFAULT_THRESHOLD: SecurityEventSeverity = 'critical';

function parseThresholdEnv(raw: string | undefined): SecurityEventSeverity {
  if (!raw) {
    return DEFAULT_THRESHOLD;
  }
  const normalized = raw.trim().toLowerCase();
  if (
    normalized === 'info' ||
    normalized === 'warn' ||
    normalized === 'critical'
  ) {
    return normalized;
  }
  // Any unrecognized value falls back to the safer (higher) default rather
  // than throwing — a misconfigured env var should not crash the producer.
  return DEFAULT_THRESHOLD;
}

/**
 * Returns true when `severity` is at least as severe as the currently
 * configured alert threshold (from `SECURITY_ALERT_SEVERITY`, defaulting
 * to `critical`).
 *
 * Env is read on every call so tests can manipulate process.env without
 * module-scope caching getting in the way.
 */
export function meetsAlertSeverityThreshold(
  severity: SecurityEventSeverity,
): boolean {
  const threshold = parseThresholdEnv(process.env.SECURITY_ALERT_SEVERITY);
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[threshold];
}
