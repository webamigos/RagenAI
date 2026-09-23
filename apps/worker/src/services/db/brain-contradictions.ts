import type {
  ContradictionPageInput,
  JudgedContradiction,
  JudgedPage,
} from '@ragenai/brain-core';

import type { Prisma } from '../../../generated/prisma/index.js';
import { getPrisma } from './prisma.js';

/**
 * The reads and writes behind Brain's contradiction check (spec C1). Every
 * query carries `organizationId` at the top level.
 */

export type ContradictionCandidates = {
  pages: (ContradictionPageInput & {
    published: boolean;
    judged: JudgedPage;
  })[];
  /** Pages citing a file this run extracted — the "new" side of a pair. */
  touched: Set<number>;
};

/**
 * Every page that is not rejected, with the passages its sources cite. A
 * rejected page is one a person said no to; a contradiction with it is not
 * one anyone has to resolve.
 */
export async function loadContradictionCandidates(
  orgId: string,
  fileIds: ReadonlyArray<string>,
): Promise<ContradictionCandidates> {
  const rows = await getPrisma().knowledgePage.findMany({
    where: { organizationId: orgId, status: { not: 'REJECTED' } },
    select: {
      id: true,
      title: true,
      publishedAt: true,
      sources: {
        where: { organizationId: orgId, sourceDeletedAt: null },
        orderBy: { id: 'asc' },
        select: { id: true, fileId: true, quote: true },
      },
    },
    orderBy: { id: 'asc' },
  });
  const cited = [
    ...new Set(rows.flatMap((r) => r.sources.map((s) => s.fileId))),
  ];
  const files = cited.length
    ? await getPrisma().userFile.findMany({
        where: { organizationId: orgId, id: { in: cited } },
        select: { id: true, language: true },
      })
    : [];
  const languageOf = new Map(files.map((f) => [f.id, f.language]));

  const run = new Set(fileIds);
  const touched = new Set<number>();
  const pages = rows.map((row) => {
    if (row.sources.some((s) => run.has(s.fileId))) {
      touched.add(row.id);
    }
    return {
      id: row.id,
      title: row.title,
      fileIds: row.sources.map((s) => s.fileId),
      published: row.publishedAt !== null,
      judged: {
        title: row.title,
        language: dominantLanguage(
          row.sources.map((s) => languageOf.get(s.fileId) ?? null),
        ),
        claims: row.sources.map((s) => ({ sourceId: s.id, quote: s.quote })),
      },
    };
  });
  return { pages, touched };
}

/**
 * The language most of a page's passages are in, by their files' detected
 * language; null when none is known. Ties go to the first seen, which is the
 * oldest source.
 */
function dominantLanguage(languages: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const language of languages) {
    if (language) {
      counts.set(language, (counts.get(language) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  for (const [language, count] of counts) {
    if (best === null || count > counts.get(best)!) {
      best = language;
    }
  }
  return best;
}

export type ContradictionWrite =
  'raised' | 'updated' | 'unchanged' | 'dismissed' | 'cleared' | 'none';

/**
 * Record one pair's judgement. One finding per pair of pages:
 *
 * - contradictions found and none open → **raised**; an open one whose set of
 *   passages changed → **updated** in place; the same set → **unchanged**;
 * - the same set a person already **dismissed** → nothing, their decision
 *   stands. A different set is a problem nobody saw, and is raised;
 * - no contradiction, and one open from an earlier judgement → **cleared**
 *   (resolved): the pair was judged again and the conflict is gone.
 *
 * The fingerprint is the set of passage pairs, by source id, so rewording of
 * the model's explanation between runs does not reopen a dismissal.
 */
export async function recordContradictionJudgement(input: {
  orgId: string;
  pageIds: [number, number];
  contradictions: JudgedContradiction[];
  truncated: boolean;
  published: boolean;
  runId: string;
}): Promise<ContradictionWrite> {
  const prisma = getPrisma();
  const pageIds = [...input.pageIds].sort((a, b) => a - b);
  const existing = await prisma.knowledgeFinding.findMany({
    where: {
      organizationId: input.orgId,
      type: 'CONTRADICTION',
      pageIds: { equals: pageIds },
      status: { in: ['OPEN', 'DISMISSED'] },
    },
    select: { id: true, status: true, detail: true },
    orderBy: { id: 'asc' },
  });
  const open = existing.find((f) => f.status === 'OPEN');

  if (input.contradictions.length === 0) {
    if (!open) {
      return 'none';
    }
    // The judge saw only the first passages of a longer page. The conflict
    // an earlier run found may sit in the part it was not shown, so silence
    // here is not evidence that it is gone.
    if (input.truncated) {
      return 'unchanged';
    }
    await prisma.knowledgeFinding.updateMany({
      where: { organizationId: input.orgId, id: open.id, status: 'OPEN' },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
    return 'cleared';
  }

  const fingerprint = input.contradictions
    .map((c) => `${c.aSourceId}:${c.bSourceId}`)
    .sort()
    .join('|');
  const detail = {
    fingerprint,
    pairs: input.contradictions,
    truncated: input.truncated,
    runId: input.runId,
  } as unknown as Prisma.InputJsonValue;
  const severity = input.published ? 'HIGH' : 'MEDIUM';

  if (open) {
    if (fingerprintOf(open.detail) === fingerprint) {
      return 'unchanged';
    }
    await prisma.knowledgeFinding.updateMany({
      where: { organizationId: input.orgId, id: open.id, status: 'OPEN' },
      data: { detail, severity },
    });
    return 'updated';
  }
  if (
    existing.some(
      (f) =>
        f.status === 'DISMISSED' && fingerprintOf(f.detail) === fingerprint,
    )
  ) {
    return 'dismissed';
  }
  await prisma.knowledgeFinding.create({
    data: {
      organizationId: input.orgId,
      type: 'CONTRADICTION',
      severity,
      pageIds,
      detail,
    },
  });
  return 'raised';
}

function fingerprintOf(detail: unknown): string | null {
  return detail !== null &&
    typeof detail === 'object' &&
    'fingerprint' in detail &&
    typeof detail.fingerprint === 'string'
    ? detail.fingerprint
    : null;
}
