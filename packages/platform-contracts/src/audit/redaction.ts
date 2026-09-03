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

/** Marker for a value already visited, so a cycle terminates. */
export const CIRCULAR = '[CIRCULAR]';

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
/**
 * Whether to walk into a value, or keep it as it is.
 *
 * `Object.entries(new Date())` is `[]`, so recursing into anything
 * object-shaped turned a timestamp in an entity snapshot into `{}` — silent
 * data loss in the audit row, and audit rows are exactly where a timestamp
 * matters. The same applies to `Prisma.Decimal` (money), `Buffer`, `Map` and
 * `Set`, all of which appear in Prisma results.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function stripSensitiveFields(
  data: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  return strip(data, new WeakSet());
}

/**
 * `seen` guards against a cyclic snapshot. Prisma results are acyclic, but the
 * callers hand this arbitrary objects and a cycle here would be a stack
 * overflow inside an audit write — taking down the action it was recording.
 */
/**
 * Arrays nest. Mapping one level deep left an object inside an array of arrays
 * untouched, so `{ keys: [[{ token: 'secret' }]] }` reached the audit row in
 * clear text.
 */
function stripArray(value: unknown[], seen: WeakSet<object>): unknown[] {
  return value.map((item) => {
    if (Array.isArray(item)) {
      return stripArray(item, seen);
    }
    return isPlainObject(item) ? strip(item, seen) : item;
  });
}

function strip(
  data: Record<string, unknown> | null | undefined,
  seen: WeakSet<object>,
): Record<string, unknown> | null {
  if (!data) {
    return null;
  }
  if (seen.has(data)) {
    return { [CIRCULAR]: true };
  }
  seen.add(data);

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_FIELDS.has(key)) {
      cleaned[key] = REDACTED;
    } else if (Array.isArray(value)) {
      cleaned[key] = stripArray(value, seen);
    } else if (isPlainObject(value)) {
      cleaned[key] = strip(value, seen);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}
