/**
 * Whether a string is text at all, or the bytes of a binary file read as if
 * they were UTF-8.
 *
 * It exists because the worker once indexed the raw ZIP bytes of Word files:
 * a `.docx` was classified as text by its name, the Docling outage fallback
 * for text is `readFile(path, 'utf-8')`, and the chunks that reached Qdrant
 * were mostly U+FFFD and NULs — which the chat then quoted back as a source.
 * Classification was fixed at the front of the pipeline; this is the net at
 * the back, so the next way a binary reaches a text loader fails the ingest
 * instead of filling the index.
 *
 * Shared, not the worker's own, because the web app applies the same test
 * before it quotes a retrieved chunk — so a chunk indexed before the fix is
 * never shown to a user either.
 */

/**
 * The share of a string, above which it is not text. One percent is far past
 * anything a real document produces — a single mis-encoded character in a
 * paragraph is a fraction of that — and far below what a binary produces,
 * where these characters are a large part of the whole.
 */
const MAX_SUSPECT_RATIO = 0.01;

/**
 * The fewest suspect characters that can condemn a string. Without it a short
 * chunk with one mis-encoded letter ("Caf\uFFFD") would cross the ratio on its
 * own and be thrown away, though a reader would still understand it.
 */
const MIN_SUSPECT_COUNT = 4;

/**
 * Container signatures, as they read once decoded: ZIP (DOCX, XLSX, PPTX, EPUB
 * and every other OOXML/ODF file) and PDF. Both are ASCII, so they survive the
 * decode intact and sit at the very start of the text.
 */
const CONTAINER_SIGNATURES = ['PK\u0003\u0004', '%PDF-'] as const;

export type UndecodableTextReason =
  | 'container-signature'
  | 'replacement-characters'
  | 'control-characters';

/**
 * C0 controls and DEL, minus the three that ordinary text is made of — tab,
 * line feed and carriage return.
 */
function isSuspectControl(code: number): boolean {
  return (
    (code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d) ||
    code === 0x7f
  );
}

/**
 * Why a string is not decodable text, or `null` when it is.
 *
 * An empty string is text: whether an empty document may be indexed is a
 * different question, answered elsewhere.
 */
export function findUndecodableText(
  text: string,
): UndecodableTextReason | null {
  if (text.length === 0) {
    return null;
  }

  // A leading BOM or whitespace does not make a ZIP a text file.
  const head = text.replace(/^[\uFEFF\s]+/, '');
  if (CONTAINER_SIGNATURES.some((signature) => head.startsWith(signature))) {
    return 'container-signature';
  }

  let replacements = 0;
  let controls = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0xfffd) {
      replacements++;
    } else if (isSuspectControl(code)) {
      controls++;
    }
  }

  const exceeds = (count: number) =>
    count >= MIN_SUSPECT_COUNT && count / text.length > MAX_SUSPECT_RATIO;

  if (exceeds(replacements)) {
    return 'replacement-characters';
  }
  if (exceeds(controls)) {
    return 'control-characters';
  }
  return null;
}

/** `findUndecodableText(text) !== null`, for a caller that needs no reason. */
export function isUndecodableText(text: string): boolean {
  return findUndecodableText(text) !== null;
}
