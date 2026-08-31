/**
 * Presidio placeholders that survive into retrieved context.
 *
 * Documents are PII-masked at ingest (in ragen-worker), so chunks stored in
 * the vector store contain raw Presidio placeholders like `<PERSON>` or
 * `<EMAIL_ADDRESS_1>`. Unlike chat-time masking — where `StreamUnmasker`
 * restores the real values from an alias map — there is no map to restore
 * from at query time: the original text is gone by design.
 *
 * Left alone, the model simply echoes the placeholder, so the user reads
 * "wnioski zatwierdza <PERSON>". That looks like a template bug rather than a
 * deliberate redaction. Rewriting the placeholder into a readable phrase keeps
 * the signal ("a person's name was here, and it was removed") while producing
 * an answer that reads like prose.
 */

/**
 * Human-readable stand-ins per Presidio entity type. Keeping the type — rather
 * than collapsing everything to "[redacted]" — lets the model say something
 * useful about *what* was removed.
 */
const ENTITY_LABELS: Record<string, string> = {
  PERSON: 'person',
  EMAIL_ADDRESS: 'email address',
  PHONE_NUMBER: 'phone number',
  PL_PHONE: 'phone number',
  PL_PESEL: 'national ID number',
  PL_NIP: 'tax ID',
  PL_REGON: 'business registry number',
  PL_IBAN: 'bank account number',
  IBAN_CODE: 'bank account number',
  CREDIT_CARD: 'payment card number',
  PL_ID_CARD: 'ID card number',
  LOCATION: 'location',
  DATE_TIME: 'date',
  IP_ADDRESS: 'IP address',
  URL: 'URL',
};

/**
 * Matches `<PERSON>` and `<EMAIL_ADDRESS_1>` alike — Presidio emits the bare
 * form at ingest, while chat-time masking appends an index. Requiring at least
 * two characters and an uppercase-only body avoids swallowing legitimate
 * markup such as `<b>`.
 *
 * The entity group ends on a letter, not `[A-Z0-9]`, so the trailing `_1` of
 * `<PERSON_1>` is captured as the index rather than being absorbed into the
 * entity name (which would make every numbered placeholder fall through to the
 * generic label).
 */
const PLACEHOLDER_RE = /<([A-Z][A-Z_]*[A-Z])(?:_(\d+))?>/g;

/**
 * Replaces Presidio placeholders in `text` with readable redaction markers.
 *
 * Unknown entity types fall back to a generic label rather than being left
 * as-is, so a new Presidio recognizer can't leak a raw placeholder to users.
 */
export function redactPiiPlaceholders(text: string): string {
  return text.replace(PLACEHOLDER_RE, (_match, entityType: string) => {
    const label = ENTITY_LABELS[entityType] ?? 'personal data';
    return `[redacted ${label}]`;
  });
}
