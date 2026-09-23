/**
 * Whether a quote the model returned actually occurs in the source text —
 * and, when it does, where.
 *
 * Tolerant of the differences that are not paraphrase — whitespace and line
 * breaks, typographic quotes and dashes, case, the soft hyphen a PDF parser
 * leaves behind, markdown emphasis, compatibility forms such as ligatures —
 * and of nothing else.
 * A quote with one word changed is not found, and that is the point: an
 * approved citation is a claim that a person could open the source and read
 * those words there.
 */

/**
 * Characters NFKC would fold into something that reads differently:
 * superscripts and subscripts (`10²` → `102`, `H₂O` → `H2O`) and the
 * ordinal indicators `ª` `º`. Folding them would let a quote with a
 * different number verify against the source, so they are kept as written.
 */
const SUPER_OR_SUBSCRIPT =
  /([\u00aa\u00b2\u00b3\u00b9\u00ba\u02b0-\u02b8\u02e0-\u02e4\u1d2c-\u1d6a\u1d78\u1d9b-\u1dbf\u2070-\u209c\u2c7c\u2c7d\ua69c\ua69d\ua770\uab5c-\uab5f]+)/u;

/**
 * NFKC — ligatures, full-width forms, compatibility spaces fold as they
 * should — except for superscripts and subscripts, which pass through. The
 * text between them is normalised as a whole, so combining sequences still
 * compose.
 */
export function compatibilityFold(text: string): string {
  return text
    .split(SUPER_OR_SUBSCRIPT)
    .map((part, i) => (i % 2 === 1 ? part : part.normalize('NFKC')))
    .join('');
}

const SINGLE_QUOTES = /[\u2018\u2019\u201a\u201b\u2032]/;
const DOUBLE_QUOTES = /[\u201c\u201d\u201e\u201f\u2033\u00ab\u00bb]/;
const DASHES = /[\u2010-\u2015\u2212]/;

/**
 * The normalised form of `text` (already `compatibilityFold`ed), with, for every character of
 * it, the index in `text` it came from. The map is what lets a match found in
 * the normalised haystack be cut back out of the source as the source wrote
 * it.
 */
function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    // Soft hyphens, and markdown emphasis: Docling writes `**23 kg**`, a
    // model quoting the sentence writes `23 kg`, and both are the same words.
    // Dropping every `*` and backtick costs nothing a quote could need —
    // neither carries meaning in prose — and it was the largest single cause
    // of dropped claims on the eval corpus.
    if (c === '\u00ad' || c === '*' || c === '`') {
      continue;
    }
    if (/\s/.test(c)) {
      if (norm.length > 0 && !norm.endsWith(' ')) {
        norm += ' ';
        map.push(i);
      }
      continue;
    }
    let out = c;
    if (SINGLE_QUOTES.test(c)) {
      out = "'";
    } else if (DOUBLE_QUOTES.test(c)) {
      out = '"';
    } else if (DASHES.test(c)) {
      out = '-';
    }
    for (const ch of out.toLocaleLowerCase()) {
      norm += ch;
      map.push(i);
    }
  }
  if (norm.endsWith(' ')) {
    norm = norm.slice(0, -1);
    map.pop();
  }
  return { norm, map };
}

export function normalizeForQuoteMatch(text: string): string {
  return normalizeWithMap(compatibilityFold(text)).norm;
}

/** Where a quote sits in the source: `source.slice(start, end)`. */
export type QuoteLocation = { start: number; end: number };

/**
 * A source text prepared once, so checking two hundred claims does not
 * normalise a sixty-page document two hundred times.
 *
 * `source` is the text after `compatibilityFold`, which is what locations index into and what
 * `expandToSentence` cuts from — so a quote returned from here is the
 * source's own words, in the source's own case and punctuation.
 */
export class QuoteIndex {
  readonly source: string;
  private readonly norm: string;
  private readonly map: number[];

  constructor(sourceText: string) {
    this.source = compatibilityFold(sourceText);
    const { norm, map } = normalizeWithMap(this.source);
    this.norm = norm;
    this.map = map;
  }

  contains(quote: string): boolean {
    return this.locate(quote) !== null;
  }

  /** The first occurrence of `quote`, or null. */
  locate(quote: string): QuoteLocation | null {
    const needle = normalizeForQuoteMatch(quote);
    if (needle.length === 0) {
      return null;
    }
    const at = this.norm.indexOf(needle);
    if (at === -1) {
      return null;
    }
    return {
      start: this.map[at]!,
      end: this.map[at + needle.length - 1]! + 1,
    };
  }

  /** How many times `quote` occurs — more than once is an ambiguous anchor. */
  occurrences(quote: string): number {
    const needle = normalizeForQuoteMatch(quote);
    if (needle.length === 0) {
      return 0;
    }
    let count = 0;
    for (
      let at = this.norm.indexOf(needle);
      at !== -1;
      at = this.norm.indexOf(needle, at + 1)
    ) {
      count += 1;
    }
    return count;
  }
}

/** A line that starts a block of its own: list item, heading, quote, table. */
const BLOCK_START = /^[ \t]*([-*+#>|]|\d+[.)]\s)/;

/**
 * Words whose full stop is not the end of a sentence. Polish legal and
 * commercial text is dense with them — "sp. z o.o.", "ul.", "art. 5 ust. 2"
 * — and a sentence cut at each would anchor a citation to half a clause.
 */
const ABBREVIATIONS = new Set([
  'sp',
  'o.o',
  'z.o.o',
  's.a',
  'ul',
  'al',
  'pl',
  'os',
  'nr',
  'np',
  'tj',
  'tzn',
  'tzw',
  'ok',
  'godz',
  'pkt',
  'art',
  'ust',
  'poz',
  'par',
  'zł',
  'gr',
  'r',
  'w',
  'wg',
  'dot',
  'ds',
  'm.in',
  'itp',
  'itd',
  'dr',
  'mgr',
  'inż',
  'prof',
  'św',
  'e.g',
  'i.e',
  'etc',
  'vs',
  'no',
  'st',
  'mr',
  'mrs',
  'ms',
  'inc',
  'ltd',
  'co',
]);

/** Whether the punctuation at `i` ends a sentence. */
function endsSentence(source: string, i: number): boolean {
  const c = source[i];
  if (c === undefined || !/[.!?;]/.test(c)) {
    return false;
  }
  if (i + 1 < source.length && !/\s/.test(source[i + 1]!)) {
    return false;
  }
  if (c !== '.') {
    return true;
  }
  const before = source.slice(0, i).match(/([\p{L}.]+)$/u)?.[1] ?? '';
  // A single capital ("J. Kowalski") or a known abbreviation is not an end.
  if (/^\p{Lu}$/u.test(before)) {
    return false;
  }
  return !ABBREVIATIONS.has(before.toLocaleLowerCase());
}

/**
 * Widen a located quote to the sentence around it, in the source's words.
 *
 * Models quote short: "NIP 7412998301" is in the document, but it anchors a
 * citation to a fragment a reader cannot place, and a short string may occur
 * twice. The sentence it sits in is still a verbatim quote — nothing is
 * invented, only more of the source is kept — so this is done
 * deterministically rather than asked for in the prompt.
 *
 * A sentence ends at `.`, `!`, `?` or `;` followed by whitespace, at a blank
 * line, or at a line that starts a block (a list item, heading or table row),
 * so an item in a list stays that item. A table row is its own unit. Returns
 * null when the widened text would exceed `maxChars`, which leaves the quote
 * as the model gave it.
 */
export function expandToSentence(
  source: string,
  location: QuoteLocation,
  maxChars: number,
): string | null {
  const lineStart = source.lastIndexOf('\n', location.start - 1) + 1;
  const lineEndRaw = source.indexOf('\n', location.end);
  const lineEnd = lineEndRaw === -1 ? source.length : lineEndRaw;
  if (source.slice(lineStart, lineEnd).trimStart().startsWith('|')) {
    const row = source.slice(lineStart, lineEnd).trim();
    return row.length <= maxChars ? row : null;
  }

  let start = location.start;
  while (start > 0) {
    const prev = source[start - 1]!;
    if (prev === '\n') {
      const before = source.slice(0, start - 1);
      const lineAbove = before.slice(before.lastIndexOf('\n') + 1);
      if (
        lineAbove.trim() === '' ||
        BLOCK_START.test(source.slice(start)) ||
        BLOCK_START.test(lineAbove) ||
        /[:.!?;]\s*$/.test(lineAbove)
      ) {
        break;
      }
    }
    if (/\s/.test(prev) && endsSentence(source, start - 2)) {
      break;
    }
    start -= 1;
  }

  let end = location.end;
  while (end < source.length) {
    const c = source[end]!;
    if (endsSentence(source, end)) {
      end += 1;
      break;
    }
    if (c === '\n') {
      const rest = source.slice(end + 1);
      if (
        rest.startsWith('\n') ||
        /^\s*\n/.test(rest) ||
        BLOCK_START.test(rest)
      ) {
        break;
      }
    }
    end += 1;
  }

  const sentence = source
    .slice(start, end)
    .replace(/^[ \t]*([-*+>]|\d+[.)])\s+/, '')
    .replace(/^#+\s+/, '')
    .trim();
  return sentence.length > 0 && sentence.length <= maxChars ? sentence : null;
}
