import type { CandidateEdge, CandidatePage } from '@ragenai/brain-core';
import { PLATFORM_FEATURE_DEFAULTS_KEY } from '@ragenai/platform-contracts';

import type { Prisma } from '../../../generated/prisma/index.js';
import { getPrisma } from './prisma.js';

/**
 * Ragen Brain's reads and writes, on Prisma. Every query carries
 * `organizationId` at the top level of its `where` or `data`, which is what
 * the tenant-scope guard checks and all it can check.
 */

/** The three layers `resolveFeatures` needs, unresolved. */
export async function getFeatureLayers(orgId: string) {
  const prisma = getPrisma();
  const [settings, subscriptions, platform] = await Promise.all([
    prisma.organizationSettings.findUnique({
      where: { organizationId: orgId },
      select: { featureOverrides: true },
    }),
    prisma.subscription.findMany({
      where: { referenceId: orgId },
      select: { plan: true, status: true, periodStart: true },
    }),
    prisma.settings.findUnique({
      where: { key: PLATFORM_FEATURE_DEFAULTS_KEY },
      select: { value: true },
    }),
  ]);
  return {
    orgOverrides: settings?.featureOverrides ?? null,
    subscriptions,
    platformDefaultsJson: platform?.value ?? null,
  };
}

export async function getPlanFeatures(planName: string) {
  const plan = await getPrisma().subscriptionPlan.findFirst({
    where: { name: planName },
    select: { features: true },
  });
  return plan?.features ?? null;
}

/**
 * The text to extract from: the document's **active version**, not
 * `UserDocument.content`. The version is what a citation is pinned to, so the
 * text checked for quotes and the id recorded on each source must be the same
 * row — reading the two from different places would pin a citation to a
 * version whose text nobody checked.
 */
export async function getExtractionSource(fileId: string, orgId: string) {
  // `findFirst` on the two columns rather than `findUnique` on the compound
  // key: the tenant-scope guard reads a top-level `organizationId` and does
  // not see one inside `id_organizationId`, so the stricter-looking form
  // warns on every call and teaches the reader to ignore the guard.
  const file = await getPrisma().userFile.findFirst({
    where: { id: fileId, organizationId: orgId },
    select: { fileName: true, documentId: true, language: true },
  });
  if (!file?.documentId) {
    return null;
  }
  const version = await getPrisma().documentVersion.findFirst({
    where: {
      organizationId: orgId,
      documentId: file.documentId,
      isActive: true,
    },
    select: { id: true, content: true },
  });
  if (!version) {
    return null;
  }
  return {
    fileName: file.fileName,
    /** ISO 639-3, as ingest detected it; null when it could not tell. */
    language: file.language,
    documentVersionId: version.id,
    text: version.content,
  };
}

/**
 * Write one document's candidates, replacing what an earlier extraction of the
 * same document left — so a retry, or D3's "retry this document", converges
 * instead of piling up duplicates.
 *
 * Only pages nobody has touched are replaced: a `CANDIDATE` whose every source
 * is this file and which has no decision. A page someone set an owner on, or
 * that also cites another document, is curation work; it stays, and a fresh
 * candidate gets a suffixed slug beside it for the review queue to merge. A
 * page with a decision could not be deleted anyway — the ledger's foreign key
 * is NO ACTION — so the filter is also what keeps this from failing.
 *
 * Open findings naming a replaced page are resolved in the same transaction.
 *
 * Pages, sources and edges go in one transaction: a half-written candidate
 * with no sources would be a page with nothing behind it, the one shape
 * assembly refuses to produce.
 */
export async function replaceCandidatesFromFile(input: {
  orgId: string;
  fileId: string;
  pages: CandidatePage[];
  edges: CandidateEdge[];
}): Promise<{ pagesCreated: number; pagesReplaced: number }> {
  const { orgId, fileId } = input;
  return getPrisma().$transaction(async (tx) => {
    const stale = await tx.knowledgePage.findMany({
      where: {
        organizationId: orgId,
        status: 'CANDIDATE',
        sources: { some: { fileId }, every: { fileId } },
        decisions: { none: {} },
      },
      select: { id: true },
    });
    const staleIds = stale.map((p) => p.id);
    const replaced =
      staleIds.length > 0
        ? await tx.knowledgePage.deleteMany({
            where: { organizationId: orgId, id: { in: staleIds } },
          })
        : { count: 0 };
    if (staleIds.length > 0) {
      // A finding naming a page that no longer exists is one nobody can act
      // on — a contradiction between a candidate and something else, found
      // by an earlier run. The fresh candidates are judged again by this
      // run's contradiction pass.
      await tx.knowledgeFinding.updateMany({
        where: {
          organizationId: orgId,
          status: 'OPEN',
          pageIds: { hasSome: staleIds },
        },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
    }

    const taken = new Set(
      (
        await tx.knowledgePage.findMany({
          where: {
            organizationId: orgId,
            slug: { in: input.pages.map((p) => p.slug) },
          },
          select: { slug: true },
        })
      ).map((p) => p.slug),
    );
    const suffixed = await tx.knowledgePage.findMany({
      where: {
        organizationId: orgId,
        OR: input.pages.map((p) => ({ slug: { startsWith: `${p.slug}-` } })),
      },
      select: { slug: true },
    });
    for (const { slug } of suffixed) {
      taken.add(slug);
    }

    const idBySlug = new Map<string, number>();
    for (const page of input.pages) {
      const slug = freeSlug(page.slug, taken);
      taken.add(slug);
      const created = await tx.knowledgePage.create({
        data: {
          organizationId: orgId,
          title: page.title,
          slug,
          type: page.type,
          content: page.content,
          contentHash: page.contentHash,
          accessibleBy: page.accessibleBy,
        },
        select: { id: true },
      });
      idBySlug.set(page.slug, created.id);
      await tx.knowledgePageSource.createMany({
        data: page.sources.map((source) => ({
          organizationId: orgId,
          pageId: created.id,
          fileId: source.fileId,
          documentVersionId: source.documentVersionId,
          span: source.span,
          quote: source.quote,
          hash: source.hash,
        })),
      });
    }

    const edges: Prisma.KnowledgeEdgeCreateManyInput[] = [];
    for (const edge of input.edges) {
      const fromPageId = idBySlug.get(edge.fromSlug);
      const toPageId = idBySlug.get(edge.toSlug);
      if (fromPageId !== undefined && toPageId !== undefined) {
        edges.push({
          organizationId: orgId,
          fromPageId,
          toPageId,
          kind: edge.kind,
          origin: edge.origin,
        });
      }
    }
    if (edges.length > 0) {
      await tx.knowledgeEdge.createMany({ data: edges, skipDuplicates: true });
    }

    return { pagesCreated: input.pages.length, pagesReplaced: replaced.count };
  });
}

function freeSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) {
    return base;
  }
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

/**
 * Raise, or refresh, the document's `EXTRACTION_FAILED` finding. One open
 * finding per document: a second failure updates the first rather than
 * stacking another the inbox would show twice.
 */
export async function recordExtractionFailed(input: {
  orgId: string;
  fileId: string;
  detail: { reason: string; windowIndex: number | null; runId: string };
}): Promise<void> {
  const prisma = getPrisma();
  const detail = input.detail as unknown as Prisma.InputJsonValue;
  const open = await prisma.knowledgeFinding.findFirst({
    where: {
      organizationId: input.orgId,
      type: 'EXTRACTION_FAILED',
      fileId: input.fileId,
      status: 'OPEN',
    },
    select: { id: true },
  });
  if (open) {
    await prisma.knowledgeFinding.updateMany({
      where: { organizationId: input.orgId, id: open.id },
      data: { detail, detectedAt: new Date() },
    });
    return;
  }
  await prisma.knowledgeFinding.create({
    data: {
      organizationId: input.orgId,
      type: 'EXTRACTION_FAILED',
      severity: 'MEDIUM',
      fileId: input.fileId,
      pageIds: [],
      detail,
    },
  });
}

/** Close the document's open `EXTRACTION_FAILED` finding after a success. */
export async function resolveExtractionFailed(input: {
  orgId: string;
  fileId: string;
}): Promise<number> {
  const result = await getPrisma().knowledgeFinding.updateMany({
    where: {
      organizationId: input.orgId,
      type: 'EXTRACTION_FAILED',
      fileId: input.fileId,
      status: 'OPEN',
    },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
  });
  return result.count;
}
