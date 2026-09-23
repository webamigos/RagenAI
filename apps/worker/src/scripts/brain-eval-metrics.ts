import {
  assembleGraph,
  findTables,
  normalizeForQuoteMatch,
  type AssembledCandidates,
} from '@ragenai/brain-core';

/**
 * The measurements behind `brain-extract-eval.ts`, pure so they are tested
 * without a model. Each one is a gap the first B5 run found:
 *
 * - **description language** — page descriptions came back English on a
 *   Polish document;
 * - **short quotes** — true but weak anchors ("NIP 7412998301");
 * - **edges** — none at all, on a document with obvious relations.
 *
 * And one C4 added, because edges per document does not say whether there is
 * a graph to draw: **isolated pages** (no edge at all, the population ORPHAN
 * would flag once approved) and **communities**, from the same
 * `assembleGraph` the graph view and the export use.
 */

export type EvalLanguage = 'pl' | 'en';

const PL_WORDS = new Set([
  'i',
  'w',
  'z',
  'na',
  'się',
  'jest',
  'do',
  'dla',
  'oraz',
  'nie',
  'od',
  'przez',
  'po',
  'lub',
  'to',
  'który',
  'która',
  'które',
  'jak',
  'są',
  'przy',
  'o',
  'za',
  'tym',
  'jego',
  'ich',
]);
const EN_WORDS = new Set([
  'the',
  'and',
  'of',
  'to',
  'is',
  'for',
  'in',
  'with',
  'a',
  'an',
  'by',
  'on',
  'or',
  'are',
  'that',
  'which',
  'it',
  'its',
  'from',
  'as',
  'be',
  'this',
  'at',
  'who',
]);
const PL_LETTERS = /[ąćęłńóśźż]/i;

/**
 * Polish or English, by stopwords and diacritics — or `null` when a text is
 * too short to say. Two languages is the whole corpus, and a heuristic that
 * is right on a sentence beats a detector that is unreliable on one.
 */
export function languageOf(text: string): EvalLanguage | null {
  const words = text.toLocaleLowerCase().match(/\p{L}+/gu) ?? [];
  let pl = PL_LETTERS.test(text) ? 2 : 0;
  let en = 0;
  for (const word of words) {
    if (PL_WORDS.has(word)) {
      pl += 1;
    }
    if (EN_WORDS.has(word)) {
      en += 1;
    }
  }
  if (pl === en) {
    return null;
  }
  return pl > en ? 'pl' : 'en';
}

/** A quote shorter than this is a weak anchor: it may recur, and says little. */
export const SHORT_QUOTE_CHARS = 30;

export type DocMetrics = {
  pages: number;
  claims: number;
  dropped: number;
  descriptions: number;
  /** Descriptions detected in the document's own language. */
  descriptionsInLanguage: number;
  /** Descriptions detected in the other language — the failure itself. */
  descriptionsInOtherLanguage: number;
  shortQuotes: number;
  edges: number;
  edgesExtracted: number;
  /** Pages with no edge to any other page of the document. */
  isolatedPages: number;
  /** Louvain communities over the document's pages, isolated pages included. */
  communities: number;
  /** Entities folded into their table by assembly — the model split it. */
  foldedTableRows: number;
  /** Data rows of the document's tables, and how many some claim cites. */
  tableRows: number;
  tableRowsCited: number;
};

/** Read a page's description back out of its rendered content. */
function descriptionOf(content: string): string {
  // renderPage: "# Title", blank, description, blank, statements…
  return content.split('\n')[2] ?? '';
}

/**
 * Data rows of the text's tables — header and separator excluded — and how
 * many of them a kept claim quotes. A table the model split into rows and
 * then stopped part-way through loses rows, and folding cannot bring back
 * what was never returned; this is what shows it.
 */
export function tableCoverage(
  text: string,
  assembled: AssembledCandidates,
): { rows: number; cited: number } {
  const quotes = assembled.pages.flatMap((p) =>
    p.sources.map((s) => normalizeForQuoteMatch(s.quote)),
  );
  let rows = 0;
  let cited = 0;
  for (const table of findTables(text.normalize('NFKC'))) {
    const lines = text
      .normalize('NFKC')
      .slice(table.start, table.end)
      .split('\n')
      .slice(2);
    for (const line of lines) {
      if (line.trim() === '') {
        continue;
      }
      rows += 1;
      const row = normalizeForQuoteMatch(line);
      if (quotes.some((q) => q.includes(row) || row.includes(q))) {
        cited += 1;
      }
    }
  }
  return { rows, cited };
}

export function measure(
  assembled: AssembledCandidates,
  language: EvalLanguage,
  text = '',
): DocMetrics {
  let inLanguage = 0;
  let otherLanguage = 0;
  let shortQuotes = 0;
  let claims = 0;
  for (const page of assembled.pages) {
    const detected = languageOf(descriptionOf(page.content));
    if (detected === language) {
      inLanguage += 1;
    } else if (detected !== null) {
      otherLanguage += 1;
    }
    for (const source of page.sources) {
      claims += 1;
      if (source.quote.trim().length < SHORT_QUOTE_CHARS) {
        shortQuotes += 1;
      }
    }
  }
  const { stats: graph } = assembleGraph(
    assembled.pages.map((page) => ({
      id: page.slug,
      title: page.title,
      type: page.type,
      status: 'CANDIDATE' as const,
    })),
    assembled.edges.map((edge) => ({
      from: edge.fromSlug,
      to: edge.toSlug,
      kind: edge.kind,
      origin: edge.origin,
      confidence: null,
    })),
  );
  const coverage = tableCoverage(text, assembled);
  return {
    pages: assembled.pages.length,
    claims,
    dropped: assembled.unverifiedClaims,
    descriptions: assembled.pages.length,
    descriptionsInLanguage: inLanguage,
    descriptionsInOtherLanguage: otherLanguage,
    shortQuotes,
    edges: assembled.edges.length,
    edgesExtracted: assembled.edges.filter((e) => e.origin === 'EXTRACTED')
      .length,
    isolatedPages: graph.isolated,
    communities: graph.communities,
    foldedTableRows: assembled.foldedTableRows,
    tableRows: coverage.rows,
    tableRowsCited: coverage.cited,
  };
}

export type ArmSummary = {
  documents: number;
  failed: number;
  pages: number;
  claims: number;
  dropRate: number | null;
  /** Share of descriptions in the wrong language. */
  wrongLanguageRate: number | null;
  shortQuoteRate: number | null;
  edgesPerDocument: number;
  extractedEdgeShare: number | null;
  /** Share of pages with no edge — what the graph cannot place. */
  isolatedPageShare: number | null;
  /** Pages per community, isolated pages counting as their own. */
  pagesPerCommunity: number | null;
  /** Runs in which assembly had to fold a split table back together. */
  runsWithFoldedTables: number;
  /** Share of table data rows some kept claim cites. */
  tableRowCoverage: number | null;
  tokens: number;
};

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

export function summarize(
  runs: { metrics: DocMetrics | null; tokens: number }[],
): ArmSummary {
  const ok = runs.flatMap((r) => (r.metrics ? [r.metrics] : []));
  const sum = (pick: (m: DocMetrics) => number) =>
    ok.reduce((n, m) => n + pick(m), 0);
  const claims = sum((m) => m.claims);
  const edges = sum((m) => m.edges);
  return {
    documents: runs.length,
    failed: runs.length - ok.length,
    pages: sum((m) => m.pages),
    claims,
    dropRate: ratio(
      sum((m) => m.dropped),
      claims + sum((m) => m.dropped),
    ),
    wrongLanguageRate: ratio(
      sum((m) => m.descriptionsInOtherLanguage),
      sum((m) => m.descriptions),
    ),
    shortQuoteRate: ratio(
      sum((m) => m.shortQuotes),
      claims,
    ),
    edgesPerDocument: ok.length === 0 ? 0 : edges / ok.length,
    extractedEdgeShare: ratio(
      sum((m) => m.edgesExtracted),
      edges,
    ),
    isolatedPageShare: ratio(
      sum((m) => m.isolatedPages),
      sum((m) => m.pages),
    ),
    pagesPerCommunity: ratio(
      sum((m) => m.pages),
      sum((m) => m.communities),
    ),
    runsWithFoldedTables: ok.filter((m) => m.foldedTableRows > 0).length,
    tableRowCoverage: ratio(
      sum((m) => m.tableRowsCited),
      sum((m) => m.tableRows),
    ),
    tokens: runs.reduce((n, r) => n + r.tokens, 0),
  };
}
