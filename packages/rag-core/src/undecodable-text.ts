/**
 * Whether a string is text at all, or the bytes of a binary file read as if
 * they were UTF-8 — or a file's raw markup, which is ASCII but is not the
 * file's text.
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
  | 'control-characters'
  | 'markup';

/*
 * Raw markup is the second way a file reaches the index as something other
 * than its text, and the one the checks above cannot see: an OOXML part is
 * clean ASCII. An `.xlsx` indexed before the worker sniffed content (#1347)
 * reached Qdrant as its worksheet XML — `<col min="8" max="8" width="12.83"
 * customWidth="1"/>` — and the chat quoted it back as a source.
 *
 * The test is density, not presence. A document is allowed to contain markup:
 * Markdown carries inline HTML (`<br>` in a table cell, `<sup>`), Docling
 * sometimes serialises a table as an HTML `<table>`, and a document about XML
 * quotes some. What no document a person wrote looks like is text that is
 * almost entirely tags and attributes.
 */

/**
 * The share of non-whitespace characters inside markup, at or above which a
 * string is markup rather than text.
 *
 * Measured on the shapes the tests pin: a chunk of an OOXML worksheet is 0.97
 * — its text is a few digits in `<v>` between attribute-heavy tags, and the
 * styles and document parts are the same shape. Prose that quotes XML
 * elements while explaining them is 0.27, and a Markdown table with `<br>` in
 * its cells is near zero, because that HTML is set aside (below). The line
 * sits nearer the machine side on purpose: a false refusal fails a person's
 * upload, a false pass only shows one ugly quote. The shared-strings part —
 * the one OOXML part that is mostly words — lands either side of it (0.77
 * with short labels, lower with sentences), and either answer is acceptable
 * for text that at least reads.
 */
const MIN_MARKUP_RATIO = 0.8;

/**
 * The fewest tags that can condemn a string. A single self-closing tag is
 * all markup and is still a reasonable thing for a short chunk to hold, so
 * nothing is judged on fewer than this.
 */
const MIN_MARKUP_TAGS = 8;

/**
 * HTML that Markdown and Docling legitimately emit. Its tags are set aside
 * before measuring rather than counted as markup, because a Docling HTML table
 * of figures — `<tr><td>12</td></tr>` — is a real table whose tags outweigh
 * its digits, and refusing it would refuse the document. `col` is deliberately
 * absent: it is the element an OOXML worksheet opens with, and Docling's HTML
 * tables do not use it.
 */
const CONTENT_HTML_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'blockquote',
  'br',
  'caption',
  'code',
  'dd',
  'del',
  'details',
  'div',
  'dl',
  'dt',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'ins',
  'kbd',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
]);

/** An element tag, an XML declaration or processing instruction, a comment. */
const TAG =
  /<\/?([A-Za-z][\w.-]*(?::[\w.-]+)?)(?:\s[^<>]*)?>|<\?[^<>]*\?>|<!--[\s\S]*?-->/g;

/**
 * A tag cut in half at the chunk's edges: attributes closing on `>` before
 * any `<` at the start, a tag opened and never closed at the end. A chunk of
 * an XML part begins and ends mid-tag as often as not.
 */
const LEADING_FRAGMENT = /^[^<>]*?[\w:-]+="[^"<>]*"[^<>]*>/;
const TRAILING_FRAGMENT = /<[A-Za-z?!][^<>]*$/;

/**
 * Code the author fenced is code on purpose — a README quoting a config file
 * is prose about XML, not XML — so fenced blocks and inline code spans are
 * set aside before measuring. An unclosed fence runs to the end, which is
 * what a chunk cut inside a code block looks like.
 */
const FENCED_CODE = /(```|~~~)[\s\S]*?(?:\1|$)|`[^`\n]*`/g;

function nonWhitespaceLength(text: string): number {
  return text.replace(/\s+/g, '').length;
}

/** Whether a string is predominantly markup — see the constants above. */
function isPredominantlyMarkup(text: string): boolean {
  if (!text.includes('<')) {
    return false;
  }
  let rest = text.replace(FENCED_CODE, ' ');

  let markupChars = 0;
  let tags = 0;
  rest = rest.replace(TAG, (match: string, name: string | undefined) => {
    if (name !== undefined && CONTENT_HTML_TAGS.has(name.toLowerCase())) {
      return ' ';
    }
    tags++;
    markupChars += nonWhitespaceLength(match);
    return ' ';
  });
  if (tags < MIN_MARKUP_TAGS) {
    return false;
  }

  for (const fragment of [LEADING_FRAGMENT, TRAILING_FRAGMENT]) {
    const match = fragment.exec(rest);
    if (match) {
      markupChars += nonWhitespaceLength(match[0]);
      rest = rest.replace(fragment, ' ');
    }
  }

  const total = markupChars + nonWhitespaceLength(rest);
  return total > 0 && markupChars / total >= MIN_MARKUP_RATIO;
}

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
  if (isPredominantlyMarkup(text)) {
    return 'markup';
  }
  return null;
}

/** `findUndecodableText(text) !== null`, for a caller that needs no reason. */
export function isUndecodableText(text: string): boolean {
  return findUndecodableText(text) !== null;
}
