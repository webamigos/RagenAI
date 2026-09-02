/**
 * Field names whose values must never reach an audit row, and the walker that
 * strips them.
 *
 * Audit entries record what changed, which means they are handed whole entity
 * snapshots — including, at various call sites, provider credentials, vault
 * tokens and OAuth secrets. This list is the only thing standing between those
 * and a table that is read casually, exported to CSV, and kept for a long time.
 *
 * It lives here because two apps write audit rows: apps/web through
 * `trackAudit`, and apps/admin through its own `recordAdminAction`. A second
 * copy of this list would be a copy that goes stale in exactly the direction
 * that matters — a new credential column added to `OrganizationSettings` and
 * redacted in one app but not the other. See ADR-33.
 */
export const SENSITIVE_FIELDS: ReadonlySet<string> = new Set([
  'password',
  'token',
  'secret',
  'apiKey',
  'accessToken',
  'refreshToken',
  'hashedValue',
  'maskedValue',
  'codeVerifier',
  'clientSecret',
  'openaiApiKey',
  'anthropicApiKey',
  'googleApiKey',
  'bedrockCredentials',
  'openrouterApiKey',
  'fireworksApiKey',
  'azureOpenaiCredentials',
  'litellmApiKey',
  'litellmKeyToken',
]);

export const REDACTED = '[REDACTED]';

/**
 * Replace every sensitive value with `[REDACTED]`, walking nested objects and
 * objects inside arrays.
 *
 * Matching is by key name, case-sensitively, at any depth — the keys above are
 * the camelCase Prisma field names, which is what a snapshot of an entity
 * carries. A key is redacted for its *name*, not its value, so a field that
 * happens to be null or empty is still reported as redacted rather than
 * revealing that it was unset.
 */
export function stripSensitiveFields(
  data: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!data) {
    return null;
  }
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_FIELDS.has(key)) {
      cleaned[key] = REDACTED;
    } else if (Array.isArray(value)) {
      cleaned[key] = value.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? stripSensitiveFields(item as Record<string, unknown>)
          : item,
      );
    } else if (value && typeof value === 'object') {
      cleaned[key] = stripSensitiveFields(value as Record<string, unknown>);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}
