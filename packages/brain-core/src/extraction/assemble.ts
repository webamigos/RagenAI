import type {
  KnowledgeEdgeOrigin,
  KnowledgePageType,
  Principal,
} from '@ragenai/brain-contracts';

import { intersectPrincipals } from '../access/intersect-principals';
import { quoteHash, sha256, slugify } from '../text';
import type { ExtractionResult } from './schema';
import { consolidateTableRows, findTables } from './tables';
import {
  expandToSentence,
  QuoteIndex,
  type QuoteLocation,
} from './verify-quotes';

/** The document the windows came from, as curation will cite it. */
export type ExtractionSource = {
  organizationId: string;
  fileId: string;
  /** The active version whose text was extracted — the citation's anchor. */
  documentVersionId: string;
  /** The full text of that version, which every quote is checked against. */
  text: string;
  /** The file's `accessible_by`, as `computeFileAccessPrincipals` wrote it. */
  principals: ReadonlyArray<string>;
};

export type CandidateSource = {
  fileId: string;
  documentVersionId: string;
  span: string;
  quote: string;
  hash: string;
};

export type CandidatePage = {
  slug: string;
  title: string;
  type: KnowledgePageType;
  content: string;
  contentHash: string;
  accessibleBy: Principal[];
  sources: CandidateSource[];
};

export type CandidateEdge = {
  fromSlug: string;
  toSlug: string;
  kind: string;
  origin: KnowledgeEdgeOrigin;
};

/** A claim dropped because its quote does not occur in the source. */
export type UnverifiedClaim = {
  entityTitle: string;
  statement: string;
  quote: string;
  locator: string;
};

export type AssembledCandidates = {
  pages: CandidatePage[];
  edges: CandidateEdge[];
  /** `unverified.length` — kept as a number for callers that only count. */
  unverifiedClaims: number;
  /**
   * The dropped claims themselves, so a person judging extraction quality
   * (B5's preview) can see *why* they went — a paraphrase, a translated
   * quote, two passages joined — rather than only how many. Never persisted.
   */
  unverified: UnverifiedClaim[];
  /**
   * Entities folded into their table because every claim they had was a row
   * of it (`consolidateTableRows`). Counted so a measurement can see how
   * often the model split a table the prompt told it not to.
   */
  foldedTableRows: number;
  /** Rows of a folded table the model never returned, added from the table. */
  completedTableRows: number;
};

/**
 * Turn one document's window results into candidate pages and edges.
 *
 * Three rules do the work:
 *
 * 1. **A claim is kept only if its quote occurs in the source.** Checked
 *    against the whole document, not the window, so a claim near a window
 *    boundary still verifies.
 * 2. **An entity with no verified claim is not a page.** It would be a title
 *    and a model-written description with nothing behind them.
 * 3. **An edge's origin is earned.** A relation whose quote verifies is
 *    `EXTRACTED`; one the model says is stated but whose quote does not verify
 *    is `AMBIGUOUS`; one offered without a quote is `INFERRED`.
 *
 * 4. **A table is one entity.** Entities whose every claim is a row of the
 *    same table are folded into one (`consolidateTableRows`) — the prompt
 *    asks for that, and the model does not always do it.
 *
 * Entities from different windows merge on the slug of their title, because
 * the model invents its `key` per call and two windows about the same process
 * would otherwise produce two pages. A later window's description does not
 * replace an earlier one; its claims are added.
 *
 * `accessibleBy` is the intersection over the page's sources. With a single
 * source document that is its own principals, and it goes through the same
 * function so the multi-document case — merging in the review queue — cannot
 * take a different path.
 */
export function assembleCandidates(
  source: ExtractionSource,
  windows: ReadonlyArray<ExtractionResult>,
): AssembledCandidates {
  const index = new QuoteIndex(source.text);
  const accessibleBy = intersectPrincipals(source.organizationId, [
    source.principals,
  ]);

  type Draft = {
    slug: string;
    title: string;
    type: KnowledgePageType;
    description: string;
    claims: {
      statement: string;
      quote: string;
      locator: string;
      cited: string;
      /** Where the cited passage starts in the source. */
      at: number;
    }[];
  };
  const drafts = new Map<string, Draft>();
  const edges = new Map<string, CandidateEdge>();
  const unverified: UnverifiedClaim[] = [];

  for (const window of windows) {
    const slugByKey = new Map<string, string>();
    for (const entity of window.entities) {
      const slug = slugify(entity.title);
      slugByKey.set(entity.key, slug);
      if (!drafts.has(slug)) {
        drafts.set(slug, {
          slug,
          title: entity.title,
          type: entity.type,
          description: entity.description,
          claims: [],
        });
      }
    }

    for (const claim of window.claims) {
      const draft = drafts.get(slugByKey.get(claim.entityKey) ?? '');
      if (!draft) {
        continue;
      }
      const location = index.locate(claim.quote);
      if (location === null) {
        unverified.push({
          entityTitle: draft.title,
          statement: claim.statement,
          quote: claim.quote,
          locator: claim.locator,
        });
        continue;
      }
      // Keyed on the passage the model cited, before widening: the same
      // passage twice (from two windows, say) is one claim, while two
      // passages that widen to one sentence are two facts.
      const cited = quoteHash(claim.quote);
      if (!draft.claims.some((c) => c.cited === cited)) {
        draft.claims.push({
          ...claim,
          quote: anchoredQuote(index, claim.quote, location),
          cited,
          at: location.start,
        });
      }
    }

    for (const relation of window.relations) {
      const fromSlug = slugByKey.get(relation.from);
      const toSlug = slugByKey.get(relation.to);
      if (!fromSlug || !toSlug || fromSlug === toSlug) {
        continue;
      }
      let origin: KnowledgeEdgeOrigin = 'INFERRED';
      if (relation.quote !== null) {
        origin = index.contains(relation.quote) ? 'EXTRACTED' : 'AMBIGUOUS';
      }
      const key = `${fromSlug}\u0000${toSlug}\u0000${relation.kind}`;
      const existing = edges.get(key);
      // A stated edge seen once outranks the same edge inferred elsewhere.
      if (!existing || rank(origin) > rank(existing.origin)) {
        edges.set(key, { fromSlug, toSlug, kind: relation.kind, origin });
      }
    }
  }

  const consolidated = consolidateTableRows(
    [...drafts.values()],
    findTables(index.source),
    {
      source: index.source,
      claimFor: (row) => ({
        statement: row.statement,
        quote: row.text,
        locator: '',
        cited: quoteHash(row.text),
        at: row.at,
      }),
    },
  );
  const follow = (slug: string) => consolidated.renamed.get(slug) ?? slug;
  const followed = new Map<string, CandidateEdge>();
  for (const edge of edges.values()) {
    const fromSlug = follow(edge.fromSlug);
    const toSlug = follow(edge.toSlug);
    if (fromSlug === toSlug) {
      // Two rows of one table related to each other: now one page.
      continue;
    }
    const key = `${fromSlug}\u0000${toSlug}\u0000${edge.kind}`;
    const existing = followed.get(key);
    if (!existing || rank(edge.origin) > rank(existing.origin)) {
      followed.set(key, { ...edge, fromSlug, toSlug });
    }
  }

  const pages: CandidatePage[] = [];
  for (const draft of consolidated.drafts) {
    if (draft.claims.length === 0) {
      continue;
    }
    const sources = draft.claims.map((claim) => ({
      fileId: source.fileId,
      documentVersionId: source.documentVersionId,
      span: claim.locator.length > 0 ? claim.locator : '—',
      quote: claim.quote,
      hash: quoteHash(claim.quote),
    }));
    const content = renderPage(draft);
    pages.push({
      slug: draft.slug,
      title: draft.title,
      type: draft.type,
      content,
      contentHash: sha256(content),
      accessibleBy,
      sources,
    });
  }

  const slugs = new Set(pages.map((p) => p.slug));
  return {
    pages,
    edges: [...followed.values()].filter(
      (e) => slugs.has(e.fromSlug) && slugs.has(e.toSlug),
    ),
    unverifiedClaims: unverified.length,
    unverified,
    foldedTableRows: consolidated.folded,
    completedTableRows: consolidated.completed,
  };
}

/** Below this, a verified quote is widened to its sentence. */
export const MIN_ANCHOR_CHARS = 40;
/** A widened quote longer than this is not used; the model's stays. */
const MAX_ANCHOR_CHARS = 400;

/**
 * The quote a source keeps: the matched words cut from the source, or — when
 * the quote is shorter than `MIN_ANCHOR_CHARS` or occurs more than once in
 * the document — the sentence around it. Both are the document's own words;
 * the second is one a reader can find and place. See `expandToSentence`.
 */
function anchoredQuote(
  index: QuoteIndex,
  quote: string,
  location: QuoteLocation,
): string {
  if (
    quote.trim().length >= MIN_ANCHOR_CHARS &&
    index.occurrences(quote) === 1
  ) {
    // The document's own words at the place the match found, not the
    // model's rendering of them: the match forgives case, typography and
    // markdown, so the model's string can read "EUR 44" where the document
    // has "**EUR 44**" — and the source keeps the words verbatim (spec A).
    return index.source.slice(location.start, location.end).trim() || quote;
  }
  const sentence = expandToSentence(index.source, location, MAX_ANCHOR_CHARS);
  return sentence !== null && sentence.length > quote.trim().length
    ? sentence
    : quote;
}

function rank(origin: KnowledgeEdgeOrigin): number {
  return { INFERRED: 0, AMBIGUOUS: 1, EXTRACTED: 2 }[origin];
}

/**
 * A candidate page's markdown. Each statement carries a numbered reference to
 * the quote behind it, so a reviewer reads the claim and its evidence side by
 * side — the review is checking the one against the other.
 */
function renderPage(draft: {
  title: string;
  description: string;
  claims: { statement: string; quote: string; locator: string }[];
}): string {
  const statements = draft.claims.map(
    (claim, i) => `- ${claim.statement} [${i + 1}]`,
  );
  const evidence = draft.claims.map((claim, i) => {
    const where = claim.locator.length > 0 ? ` (${claim.locator})` : '';
    return `${i + 1}.${where} „${claim.quote.replace(/\s+/g, ' ')}”`;
  });
  return [
    `# ${draft.title}`,
    '',
    draft.description,
    '',
    ...statements,
    '',
    '---',
    '',
    ...evidence,
    '',
  ].join('\n');
}
