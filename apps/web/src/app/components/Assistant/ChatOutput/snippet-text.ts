/**
 * A retrieved passage as the plain sentence a reader expects under a source.
 *
 * Chunks are stored the way the parser writes them — Docling's Markdown for a
 * PDF or DOCX, a Markdown table per sheet for XLSX — and the quote printed
 * that raw: "### How long do we have…", "| Refund | 14 days | finance |".
 * The model is right to read the structure; a person reading a citation just
 * wants the words. This keeps the text and drops the syntax: heading marks,
 * emphasis, links and inline code become their text, a table row becomes its
 * cells joined by " · ", and whitespace collapses.
 *
 * Display only. The stored snippet, what the model read and what search
 * indexes are untouched.
 */
export function snippetToPlainText(snippet: string): string {
  return (
    snippet
      // Table separator rows: | --- | :---: |
      .replace(/\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?/g, ' ')
      // Links and images keep their text.
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Heading marks, wherever a flattened chunk left them.
      .replace(/(^|\s)#{1,6}\s+/g, '$1')
      // Emphasis and inline code keep their text.
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
      .replace(/`([^`]*)`/g, '$1')
      // List bullets at the start of a line.
      .replace(/(^|\n)\s*(?:[-*+]|\d+\.)\s+/g, '$1')
      // Table cells: pipes become a middle dot, empty cells disappear.
      .replace(/\s*\|\s*/g, ' · ')
      .replace(/(?:\s·\s)+/g, ' · ')
      .replace(/\s+/g, ' ')
      .replace(/^\s*·\s*|\s*·\s*$/g, '')
      .trim()
  );
}
