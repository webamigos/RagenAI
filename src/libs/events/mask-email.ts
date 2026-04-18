/**
 * Turns a full email into a log-safe rendering that still preserves
 * enough context to debug. Format:
 *   alice@example.com    → "a***@example.com"
 *   bob@gmail.com         → "b***@gmail.com"
 *   (malformed input)     → "<invalid>"
 *
 * Use this anywhere an email hits logs. Full addresses are PII and
 * shouldn't be written verbatim to stdout/stderr.
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email || typeof email !== 'string') {
    return '<invalid>';
  }
  const atIdx = email.lastIndexOf('@');
  if (atIdx <= 0 || atIdx === email.length - 1) {
    return '<invalid>';
  }
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);
  const firstChar = local[0];
  return `${firstChar}***@${domain}`;
}
