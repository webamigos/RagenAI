/**
 * Pure helpers for the Nordwind demo seed — nothing here touches a database,
 * which is what lets `tests/scripts/demo-seed-nordwind.test.ts` check the
 * content before anyone runs the seed.
 *
 * The Brain helpers are imported from `packages/brain-core`'s source rather
 * than re-implemented: a page whose hash or slug differed from the ones the
 * product computes would look right and then misbehave on the first review
 * action (a merge keyed on the slug, a publication compared on the hash).
 */
import { createHash } from 'node:crypto';

import { normalizeForQuoteMatch } from '../../../packages/brain-core/src/extraction/verify-quotes';
import {
  quoteHash,
  sha256,
  slugify,
} from '../../../packages/brain-core/src/text';

import type { DemoContent, DemoPage, DocKey, Locale } from './types.js';
import { DOCS, EDGES, PAGES, PEOPLE } from './structure.js';

export { quoteHash, sha256, slugify };

/**
 * A UUID derived from a string, so every re-seed gives every row the same id
 * — and every screenshot URL (`/brain/pages/<id>`, `/threads/<id>`) survives
 * a re-seed. Shaped as a version-4 UUID so `@db.Uuid` and zod's `.uuid()`
 * both accept it.
 */
export function stableUuid(seed: string): string {
  const hex = createHash('sha256')
    .update(`nordwind-demo:${seed}`)
    .digest('hex');
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

/** Deterministic PRNG (mulberry32), so a re-seed produces identical analytics. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class QuoteNotFoundError extends Error {}

/** The version text a page source points at: 1-based, defaulting to the active one. */
export function versionText(
  content: DemoContent,
  doc: DocKey,
  version?: number,
): string {
  const versions = content.documents[doc].versions;
  const index = (version ?? versions.length) - 1;
  const text = versions[index];
  if (text === undefined) {
    throw new QuoteNotFoundError(`${doc} has no version ${version}`);
  }
  return text;
}

/** Throws unless `quote` occurs verbatim in `text` — the promise a KnowledgePageSource makes. */
export function assertQuoteIn(
  text: string,
  quote: string,
  where: string,
): void {
  if (!text.includes(quote)) {
    throw new QuoteNotFoundError(`Quote not found in ${where}: "${quote}"`);
  }
}

/** Whether the quote survives into `text`, compared the way the STALE rule compares. */
export function quoteSurvives(text: string, quote: string): boolean {
  return normalizeForQuoteMatch(text).includes(normalizeForQuoteMatch(quote));
}

/**
 * A reader's pointer for a quote: the page it falls on (for paginated types)
 * and the heading above it — "s. 2 · 2. Planowanie urlopu".
 */
export function spanFor(
  text: string,
  quote: string,
  opts: { pageCount: number | null; pageLabel: string },
): string {
  const at = text.indexOf(quote);
  if (at < 0) {
    return '—';
  }
  const before = text.slice(0, at);
  const headings = [
    ...before.matchAll(/^(?:##\s+(.+)|((?:Arkusz|Sheet):\s*.+))$/gm),
  ];
  const last = headings.at(-1);
  const heading = last ? (last[1] ?? last[2] ?? '').trim() : '';
  const parts: string[] = [];
  if (opts.pageCount && opts.pageCount > 1) {
    const page = Math.min(
      opts.pageCount,
      Math.floor((at / text.length) * opts.pageCount) + 1,
    );
    parts.push(`${opts.pageLabel} ${page}`);
  }
  if (heading) {
    parts.push(heading);
  }
  return parts.length > 0 ? parts.join(' · ') : '—';
}

/**
 * A page's markdown, in exactly the shape `renderPage` in
 * `packages/brain-core/src/extraction/assemble.ts` writes — the detail screen
 * and the merge path both parse that shape.
 */
export function renderPageContent(draft: {
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

/** A published page's vehicle file name, as `vehicleFileName` in the publish command forms it. */
export function vehicleFileName(title: string): string {
  return (
    title
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f/\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200)
  );
}

export interface BuiltSource {
  doc: DocKey;
  version: number;
  quote: string;
  span: string;
}

export interface BuiltPage {
  key: string;
  title: string;
  slug: string;
  content: string;
  contentHash: string;
  sources: BuiltSource[];
}

/** Renders one page and checks every quote against the version it cites. */
export function buildPage(
  content: DemoContent,
  page: DemoPage,
  locale: Locale,
): BuiltPage {
  const pageLabel = locale === 'pl' ? 's.' : 'p.';
  const sources: BuiltSource[] = page.claims.map(({ source }) => {
    const versions = content.documents[source.doc].versions.length;
    const version = source.version ?? versions;
    const text = versionText(content, source.doc, version);
    assertQuoteIn(
      text,
      source.quote,
      `${source.doc} v${version} (page ${page.key})`,
    );
    return {
      doc: source.doc,
      version,
      quote: source.quote,
      span:
        source.span ??
        spanFor(text, source.quote, {
          pageCount: DOCS[source.doc].pageCount,
          pageLabel,
        }),
    };
  });
  const rendered = renderPageContent({
    title: page.title,
    description: page.summary,
    claims: page.claims.map((claim, i) => ({
      statement: claim.text,
      quote: claim.source.quote,
      locator: sources[i]!.span === '—' ? '' : sources[i]!.span,
    })),
  });
  return {
    key: page.key,
    title: page.title,
    slug: slugify(page.title),
    content: rendered,
    contentHash: sha256(rendered),
    sources,
  };
}

/** The statuses the finding rules look at (`CURATED_PAGE_STATUSES`). */
const CURATED = new Set(['APPROVED', 'STALE']);

/**
 * The computed findings the product's reconcile rules would raise on this
 * structure — ORPHAN (no link), UNOWNED (owner left) and STALE (a pinned quote
 * gone from the active version). Deriving them rather than listing them keeps
 * the seeded findings true: a reconcile run after the first click in the
 * product resolves any finding whose condition does not hold.
 */
export function computedFindings(content: DemoContent): {
  orphans: string[];
  ownerLeft: string[];
  stale: { page: string; sourceIndex: number }[];
} {
  const linked = new Set<string>();
  for (const [from, to] of EDGES) {
    if (
      PAGES[from]?.status !== 'REJECTED' &&
      PAGES[to]?.status !== 'REJECTED'
    ) {
      linked.add(from);
      linked.add(to);
    }
  }
  const orphans: string[] = [];
  const ownerLeft: string[] = [];
  const stale: { page: string; sourceIndex: number }[] = [];
  for (const [key, meta] of Object.entries(PAGES)) {
    if (!CURATED.has(meta.status)) {
      continue;
    }
    if (!linked.has(key)) {
      orphans.push(key);
    }
    if (meta.owner && PEOPLE[meta.owner].role === null) {
      ownerLeft.push(key);
    }
    content.pages[key]!.claims.forEach(({ source }, sourceIndex) => {
      const versions = content.documents[source.doc].versions;
      const pinned = source.version ?? versions.length;
      if (
        pinned !== versions.length &&
        !quoteSurvives(versions.at(-1)!, source.quote)
      ) {
        stale.push({ page: key, sourceIndex });
      }
    });
  }
  return { orphans, ownerLeft, stale };
}

/** Every structural promise the content makes, checked in one place. */
export function validateContent(
  content: DemoContent,
  locale: Locale,
): BuiltPage[] {
  const pageKeys = Object.keys(PAGES);
  const contentKeys = Object.keys(content.pages);
  const missing = pageKeys.filter((k) => !contentKeys.includes(k));
  const extra = contentKeys.filter((k) => !pageKeys.includes(k));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Page keys disagree (${locale}): missing ${missing.join(', ')}; extra ${extra.join(', ')}`,
    );
  }
  for (const [from, to] of EDGES) {
    if (!PAGES[from] || !PAGES[to]) {
      throw new Error(`Edge names an unknown page: ${from} -> ${to}`);
    }
  }
  const built = pageKeys.map((key) =>
    buildPage(content, content.pages[key]!, locale),
  );
  const slugs = new Set(built.map((p) => p.slug));
  if (slugs.size !== built.length) {
    throw new Error(`Two pages share a slug (${locale})`);
  }
  for (const threads of Object.values(content.threads)) {
    for (const thread of threads ?? []) {
      for (const turn of [
        thread,
        ...(thread.followUp ? [thread.followUp] : []),
      ]) {
        checkTurn(
          turn.answer,
          turn.sources.map((s) => s.ref),
          `${locale}: ${thread.title}`,
        );
      }
    }
  }
  return built;
}

/** Every [n] marker names a source that exists, and the pages cited are published. */
function checkTurn(answer: string, refs: string[], where: string): void {
  const markers = [...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  for (const n of markers) {
    if (n < 1 || n > refs.length) {
      throw new Error(`[${n}] has no source in "${where}"`);
    }
  }
  if (new Set(refs).size !== refs.length) {
    throw new Error(`A source is retrieved twice in "${where}"`);
  }
  for (const ref of refs) {
    if (ref.startsWith('page:') && !PAGES[ref.slice(5)]?.published) {
      throw new Error(`"${where}" cites ${ref}, which is not published`);
    }
  }
}

/** The 1-based source numbers an answer cites, in order of first appearance. */
export function citedIndexes(answer: string): number[] {
  const seen: number[] = [];
  for (const m of answer.matchAll(/\[(\d+)\]/g)) {
    const n = Number(m[1]);
    if (!seen.includes(n)) {
      seen.push(n);
    }
  }
  return seen;
}
