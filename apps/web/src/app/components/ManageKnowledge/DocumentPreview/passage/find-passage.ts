/**
 * Finds the passage a citation quoted inside the document it came from.
 *
 * The quote and the document are the same words written two different ways.
 * The snippet is the chunk the model read: Docling's Markdown, with heading
 * marks, table pipes, list numbers the renderer generated, and — where PII
 * masking ran at ingest — `<PERSON>` in place of a name. The document is what
 * a viewer renders: mammoth's HTML, a pdf.js text layer, a sheet's cells.
 * Neither is wrong, and an exact `indexOf` between them finds nothing.
 *
 * So both sides are **folded** to the characters that carry the words —
 * letters and digits, lower-cased, diacritics and compatibility forms
 * (ligatures, full-width digits) flattened — and matched there. Everything a
 * renderer might add or drop between two words is punctuation or whitespace,
 * and folding removes it from both sides at once, so it cannot cause a
 * mismatch. Every folded character remembers where it came from, which is how
 * a match maps back to the text a viewer can mark.
 *
 * What folding cannot absorb — a list number Markdown spelled out, a
 * placeholder standing for a name the page still shows — is handled by
 * letting the match **resynchronise**: on a mismatch, look a short way ahead
 * on either side for the next few characters and carry on from there. A
 * placeholder is a wildcard with a longer reach.
 *
 * Pure, and deliberately without a DOM: every viewer builds its own haystack
 * (text nodes, text-layer items, cells) and maps the result back itself.
 */

/** Stands in for a masked value inside a folded snippet. */
const WILDCARD = '\u0000';

/**
 * PII placeholders a snippet can carry.
 *
 * `<PERSON>` and `<EMAIL_ADDRESS_1>` are Presidio's, as ingest writes them;
 * `[redacted person]` is what `redactPiiPlaceholders` rewrites them to on the
 * way to the model; `[PESEL]` is the bracketed form other maskers use. The
 * body is upper-case only, so real markup such as `<b>` is not a placeholder.
 */
const PLACEHOLDER =
  /<[A-Z][A-Z_]*[A-Z](?:_\d+)?>|\[redacted[^\]\n]{0,40}\]|\[[A-Z][A-Z_]*[A-Z](?:_\d+)?\]/g;

/** A letter or a digit in any script — the characters that carry the words. */
const WORD_CHARACTER = /[\p{L}\p{N}]/u;
const COMBINING_MARK = /\p{M}/u;

/** How many snippet characters an anchor probe is. */
const ANCHOR_LENGTH = 24;
/**
 * How far apart candidate anchors are taken in the snippet. Half an anchor,
 * so one anomaly — a list number, a placeholder — can spoil at most two
 * neighbouring anchors, never every anchor across a short paragraph.
 */
const ANCHOR_STEP = 12;
/** Occurrences of one anchor tried in the haystack before moving on. */
const OCCURRENCES_PER_ANCHOR = 4;
/** Characters that must line up again after a mismatch. */
const RESYNC_LENGTH = 10;
/** How far ahead in the haystack a resynchronisation may look. */
const RESYNC_WINDOW = 48;
/** How many snippet characters a resynchronisation may skip. */
const RESYNC_SNIPPET_SKIP = 8;
/** How much document text a single placeholder may stand for. */
const WILDCARD_WINDOW = 80;
/** The shortest part of a row that is matched to the row containing it. */
const PARTIAL_ROW_MINIMUM = 16;
/** A match shorter than this is a coincidence rather than the passage. */
const MINIMUM_MATCH = 40;

export type FoldedText = {
  /** Lower-cased letters and digits only. */
  text: string;
  /** For each folded character, its index in the original string. */
  sourceIndex: Int32Array;
};

export type PassageMatch = {
  /** Offset of the first matched character in the original haystack. */
  start: number;
  /** Offset one past the last matched character in the original haystack. */
  end: number;
  /** Share of the snippet's folded characters that matched, 0–1. */
  coverage: number;
};

/**
 * Folds text to its letters and digits, remembering where each came from.
 *
 * NFKD and not NFKC: decomposing first and dropping the combining marks is
 * what makes "ą" written as one code point and "ą" written as two fold to the
 * same thing. Characters that do not decompose, such as "ł", stay themselves
 * on both sides, which is all matching needs.
 */
export function foldText(input: string): FoldedText {
  const folded: string[] = [];
  const sourceIndex: number[] = [];

  for (let index = 0; index < input.length; index++) {
    const code = input.charCodeAt(index);

    // Fast path for ASCII, which is most of any document.
    if (code < 128) {
      if ((code >= 48 && code <= 57) || (code >= 97 && code <= 122)) {
        folded.push(input[index]);
        sourceIndex.push(index);
      } else if (code >= 65 && code <= 90) {
        folded.push(String.fromCharCode(code + 32));
        sourceIndex.push(index);
      }
      continue;
    }

    const isHighSurrogate =
      code >= 0xd800 && code <= 0xdbff && index + 1 < input.length;
    const character = isHighSurrogate
      ? input.slice(index, index + 2)
      : input[index];

    for (const part of character.normalize('NFKD').toLowerCase()) {
      if (COMBINING_MARK.test(part) || !WORD_CHARACTER.test(part)) {
        continue;
      }
      for (let unit = 0; unit < part.length; unit++) {
        folded.push(part[unit]);
        sourceIndex.push(index);
      }
    }

    if (isHighSurrogate) {
      index++;
    }
  }

  return { text: folded.join(''), sourceIndex: Int32Array.from(sourceIndex) };
}

/**
 * The snippet with its Markdown reduced to words and each placeholder turned
 * into a wildcard, folded.
 *
 * Link and image *targets* are dropped before folding, because a URL is made
 * of letters and would otherwise have to be found in a page that shows only
 * the link text. HTML comments go for the same reason — Docling writes
 * `<!-- image -->` where a picture was. The rest of the Markdown is
 * punctuation and folds away by itself.
 */
export function foldSnippet(snippet: string): string {
  const withoutMarkup = snippet
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
    .replace(/<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/g, ' ');

  return withoutMarkup
    .split(PLACEHOLDER)
    .map((piece) => foldText(piece).text)
    .join(WILDCARD);
}

/** Characters in a folded snippet that are real text, not wildcards. */
function textLength(foldedSnippet: string): number {
  let length = 0;
  for (let index = 0; index < foldedSnippet.length; index++) {
    if (foldedSnippet[index] !== WILDCARD) {
      length++;
    }
  }
  return length;
}

/**
 * Where `probe` next occurs in `haystack`, looking no further than `window`
 * characters past `from`. Bounded on purpose: an unbounded `indexOf` from a
 * resync point scans the rest of a long document for every mismatch.
 */
function indexWithin(
  haystack: string,
  probe: string,
  from: number,
  window: number,
): number {
  const found = haystack
    .slice(from, from + window + probe.length)
    .indexOf(probe);
  return found === -1 ? -1 : from + found;
}

/**
 * The first `RESYNC_LENGTH` real characters from `at`, or fewer at the very
 * end of the snippet. `null` when a wildcard interrupts them, because a probe
 * that spans a placeholder cannot be looked up literally.
 */
function probeAt(snippet: string, at: number): string | null {
  const probe = snippet.slice(at, at + RESYNC_LENGTH);
  if (probe.length < Math.min(RESYNC_LENGTH, 4) || probe.includes(WILDCARD)) {
    return null;
  }
  return probe;
}

type Run = { start: number; end: number; matched: number };

/**
 * Grows a match outwards from an anchor that lines up at `snippetAt` and
 * `haystackAt`: forwards with resynchronisation, backwards exactly apart
 * from crossing placeholders.
 *
 * Backwards is mostly exact because it only has to recover the characters
 * before an anchor that was not taken at the snippet's start. The forward
 * direction carries the passage, and is where the renderer's differences are.
 */
function extend(
  haystack: string,
  snippet: string,
  snippetAt: number,
  haystackAt: number,
): Run {
  let s = snippetAt;
  let h = haystackAt;
  let matched = 0;

  while (s < snippet.length) {
    if (snippet[s] === WILDCARD) {
      while (s < snippet.length && snippet[s] === WILDCARD) {
        s++;
      }
      const probe = probeAt(snippet, s);
      const next = probe
        ? indexWithin(haystack, probe, h, WILDCARD_WINDOW)
        : -1;
      if (next === -1) {
        break;
      }
      h = next;
      continue;
    }

    if (h < haystack.length && snippet[s] === haystack[h]) {
      s++;
      h++;
      matched++;
      continue;
    }

    let resynced = false;
    for (let skip = 0; skip <= RESYNC_SNIPPET_SKIP; skip++) {
      const probe = probeAt(snippet, s + skip);
      if (!probe) {
        continue;
      }
      const next = indexWithin(haystack, probe, h, RESYNC_WINDOW);
      if (next !== -1) {
        s += skip;
        h = next;
        resynced = true;
        break;
      }
    }
    if (!resynced) {
      break;
    }
  }

  const end = h;

  // Backwards: exact, except that a placeholder may be crossed. A snippet
  // that opens "Reklamacje rozpatruje <PERSON>, kierownik…" has no anchor
  // before the placeholder long enough to use, so without this the words
  // before a masked name would never be marked.
  s = snippetAt;
  h = haystackAt;
  while (s > 0) {
    if (snippet[s - 1] === WILDCARD) {
      while (s > 0 && snippet[s - 1] === WILDCARD) {
        s--;
      }
      const probe = snippet.slice(Math.max(0, s - RESYNC_LENGTH), s);
      if (probe.length < 4 || probe.includes(WILDCARD)) {
        break;
      }
      const windowStart = Math.max(0, h - WILDCARD_WINDOW - probe.length);
      const found = haystack.slice(windowStart, h).lastIndexOf(probe);
      if (found === -1) {
        break;
      }
      h = windowStart + found + probe.length;
      continue;
    }
    if (h > 0 && snippet[s - 1] === haystack[h - 1]) {
      s--;
      h--;
      matched++;
      continue;
    }
    break;
  }

  return { start: h, end, matched };
}

/**
 * Finds a folded snippet in an already-folded haystack.
 *
 * Exposed for the PDF viewer, which folds every page once and searches each
 * of them for the same snippet.
 */
export function findFoldedPassage(
  haystack: FoldedText,
  foldedSnippet: string,
): PassageMatch | null {
  const total = textLength(foldedSnippet);
  if (total < 6 || haystack.text.length === 0) {
    return null;
  }

  // Anchors along the whole snippet, not just its start. A chunk can open with
  // something the page does not show — a CSV chunk repeats its header row, a
  // Markdown list spells out numbers — and the longest run from any anchor is
  // the passage, where the first anchor that happens to match may not be.
  const anchorLength = Math.min(ANCHOR_LENGTH, total);
  let best: Run | null = null;

  for (
    let anchor = 0;
    anchor + anchorLength <= foldedSnippet.length;
    anchor += ANCHOR_STEP
  ) {
    const probe = foldedSnippet.slice(anchor, anchor + anchorLength);
    if (probe.includes(WILDCARD)) {
      continue;
    }

    let from = 0;
    for (let seen = 0; seen < OCCURRENCES_PER_ANCHOR; seen++) {
      const at = haystack.text.indexOf(probe, from);
      if (at === -1) {
        break;
      }
      const run = extend(haystack.text, foldedSnippet, anchor, at);
      if (!best || run.matched > best.matched) {
        best = run;
      }
      from = at + 1;
    }

    if (best && best.matched >= total) {
      break;
    }
  }

  // A short snippet has to match almost entirely; a long one needs a run long
  // enough that it cannot be a coincidence, and no more — the rest of it may
  // be on the next page, or past the 2,000-character cut.
  const required = Math.min(MINIMUM_MATCH, Math.ceil(total * 0.8));
  if (!best || best.matched < required || best.end <= best.start) {
    return null;
  }

  return {
    start: haystack.sourceIndex[best.start],
    end: haystack.sourceIndex[best.end - 1] + 1,
    coverage: Math.min(1, best.matched / total),
  };
}

/**
 * Finds `snippet` in `haystack` and returns the range to mark, in the
 * haystack's own offsets — or `null` when the passage is not there.
 *
 * `null` is an answer, not a failure: a document re-uploaded since the answer,
 * a passage on another page, a chunk that was mostly a table. Callers show a
 * hint and the document, never an error.
 */
export function findPassage(
  haystack: string,
  snippet: string,
): PassageMatch | null {
  const match = findFoldedPassage(foldText(haystack), foldSnippet(snippet));
  if (!match) {
    return null;
  }
  // Folding drops punctuation, so a match ends on the last letter — "…your
  // line manager" and then an unmarked full stop, which reads as a
  // highlighter that slipped. A sentence's closing punctuation touching the
  // end is taken along; a comma or colon is not, because it says the
  // sentence goes on past the passage.
  let end = match.end;
  while (end < haystack.length && CLOSING_PUNCTUATION.test(haystack[end])) {
    end++;
  }
  return { ...match, end };
}

/** Punctuation that closes a sentence, taken into a match's end. */
const CLOSING_PUNCTUATION = /[.!?)\]"'»”’…]/;

/**
 * Which rows of a sheet a snippet quoted, by index into `rows`.
 *
 * A spreadsheet chunk is rows — CSV lines from the legacy loader, Markdown
 * table rows from Docling — and a sheet is rows, so they are matched as rows
 * and not as one long string: a chunk repeats its header, and a string match
 * would anchor there and stop. A snippet line matches a row when their folded
 * cells are equal, which is indifferent to pipes, commas, quoting and padding.
 * A placeholder in a line matches any run of the row's text.
 *
 * A line that is only part of a row — a long cell cut at the snippet's
 * 2,000-character ceiling, or two fragments joined with an ellipsis — matches
 * the row that contains it, once it is long enough not to be a coincidence.
 */
export function findMatchingRows(
  rows: readonly (readonly string[])[],
  snippet: string,
): number[] {
  const lines = snippet
    .split(/\r?\n|…/)
    .map(foldSnippet)
    .filter((line) => textLength(line) >= 3);
  if (lines.length === 0) {
    return [];
  }

  const exact = new Set<string>();
  const patterns: RegExp[] = [];
  const fragments: string[] = [];
  for (const line of lines) {
    if (line.includes(WILDCARD)) {
      // Folded text is letters and digits only, so it needs no escaping.
      const body = line
        .split(WILDCARD)
        .join(`[\\p{L}\\p{N}]{0,${WILDCARD_WINDOW}}`);
      patterns.push(new RegExp(`^${body}$`, 'u'));
    } else {
      exact.add(line);
      if (line.length >= PARTIAL_ROW_MINIMUM) {
        fragments.push(line);
      }
    }
  }

  const matches: number[] = [];
  rows.forEach((row, index) => {
    const key = foldText(row.join(' ')).text;
    if (key.length < 3) {
      return;
    }
    if (
      exact.has(key) ||
      patterns.some((pattern) => pattern.test(key)) ||
      fragments.some((fragment) => key.includes(fragment))
    ) {
      matches.push(index);
    }
  });
  return matches;
}
