/**
 * A detected language's name in the reader's language: `pol` → "polski" on a
 * Polish panel, "Polish" on an English one. franc's ISO 639-3 codes are valid
 * language subtags, so Intl names them without a table of our own. Anything
 * Intl cannot name is shown as its code.
 */
export function languageName(code: string, locale: string): string {
  try {
    return (
      new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code
    );
  } catch {
    return code;
  }
}
