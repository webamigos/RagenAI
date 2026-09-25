/**
 * The language filter's value: an ISO 639-3 code as franc detects it
 * (`pol`, `eng`), or `none` for documents whose language was not detected.
 */
export type BrainLanguage = string;

/** `?lang=none`: documents with no detected language. */
export const BRAIN_LANGUAGE_NONE = 'none';

/**
 * The `?lang=` value, or null when there is none or it is not one — a
 * hand-edited address filters nothing rather than everything.
 */
export function parseBrainLanguage(
  value: string | string[] | undefined,
): BrainLanguage | null {
  const one = Array.isArray(value) ? value[0] : value;
  if (!one) {
    return null;
  }
  if (one === BRAIN_LANGUAGE_NONE || /^[a-z]{3}$/.test(one)) {
    return one;
  }
  return null;
}
