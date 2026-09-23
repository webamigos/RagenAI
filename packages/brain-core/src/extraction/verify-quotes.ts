/**
 * Whether a quote the model returned actually occurs in the source text.
 *
 * Tolerant of the differences that are not paraphrase — whitespace and line
 * breaks, typographic quotes and dashes, case, the soft hyphen a PDF parser
 * leaves behind — and of nothing else. A quote with one word changed is not
 * found, and that is the point: an approved citation is a claim that a person
 * could open the source and read those words there.
 */
export function normalizeForQuoteMatch(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/­/g, '')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

/**
 * A source text prepared once, so checking two hundred claims does not
 * normalise a sixty-page document two hundred times.
 */
export class QuoteIndex {
  private readonly haystack: string;

  constructor(sourceText: string) {
    this.haystack = normalizeForQuoteMatch(sourceText);
  }

  contains(quote: string): boolean {
    const needle = normalizeForQuoteMatch(quote);
    return needle.length > 0 && this.haystack.includes(needle);
  }
}
