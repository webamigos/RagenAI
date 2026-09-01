/**
 * Strip fields that commonly leak secrets or raw user content out of the
 * metadata payload before it hits the audit table. Mirrors the denylist in
 * `src/features/audit-logs/services/commands/create-audit-log-command.ts`
 * and extends it with prompt-injection-era keys (raw message/content).
 *
 * Security event metadata is kept deliberately sparse — store classifier
 * scores, content lengths, hashes, and identifiers, never raw payloads.
 * This scrubber is a defense-in-depth safety net; producers are expected
 * to pass safe metadata in the first place.
 */

const SENSITIVE_KEYS = new Set([
  // Secrets
  'password',
  'token',
  'secret',
  'apiKey',
  'accessToken',
  'refreshToken',
  'clientSecret',
  'hashedValue',
  'maskedValue',
  'codeVerifier',
  'openaiApiKey',
  'anthropicApiKey',
  'googleApiKey',
  'bedrockCredentials',
  'openrouterApiKey',
  'fireworksApiKey',
  'azureOpenaiCredentials',
  // Raw content (prompt-injection era)
  'content',
  'pageContent',
  'message',
  'messages',
  'prompt',
  'input',
  'output',
  'rawText',
  'pasted',
]);

const REDACTED = '[REDACTED]' as const;

export function scrubPii(
  data: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!data) {
    return {};
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key)) {
      cleaned[key] = REDACTED;
      continue;
    }
    if (Array.isArray(value)) {
      cleaned[key] = value.map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? scrubPii(item as Record<string, unknown>)
          : item,
      );
      continue;
    }
    if (value && typeof value === 'object') {
      cleaned[key] = scrubPii(value as Record<string, unknown>);
      continue;
    }
    cleaned[key] = value;
  }
  return cleaned;
}
