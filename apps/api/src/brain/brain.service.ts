import { Injectable, NotFoundException } from '@nestjs/common';
import {
  assembleGraph,
  buildBundle,
  GRAPH_BUDGETS,
  selectGraphView,
  type GraphBudget,
} from '@ragenai/brain-core';
import { canManageOrg } from '@ragenai/platform-contracts';

import { PrismaService } from '../prisma/prisma.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { type ApiContext } from '../common/types/api-context.js';

/** One line and at most one thing to do — `ragen brain next`. */
export type BrainNext = {
  state:
    | 'off'
    | 'no-documents'
    | 'extract'
    | 'retry'
    | 'review'
    | 'publish'
    | 'fix'
    | 'done';
  message: string;
  /** The panel path to act in, relative to the installation's URL. */
  path: string | null;
  /** A CLI command that goes one step further, when there is one. */
  command: string | null;
};

export type BrainCheck = {
  name: string;
  status: 'ok' | 'warning' | 'error';
  detail: string;
  hint: string | null;
};

/** A publication still writing after this long is reported as stuck. */
const STUCK_AFTER_MS = 15 * 60 * 1000;

/**
 * Ragen Brain over the public API — what `ragen brain …` reads (spec D/E,
 * CLI). Read-only: approving, merging and publishing need the context the
 * panel shows, and stay there.
 *
 * **The same gate as the panel**: an owner or admin of an organization with
 * the `brain` flag on. Anyone else gets 404 — the key's organization may not
 * have Brain, and the API should not confirm that it exists. The rules come
 * from `@ragenai/brain-core`, the package the panel and the worker use, so a
 * graph or a bundle from the CLI is the one the panel would show.
 */
@Injectable()
export class BrainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  /** Throws 404 unless the key's user may use Brain in the key's organization. */
  async assertAccess(context: ApiContext): Promise<string> {
    const orgId = context.orgId as string;
    const [member, enabled] = await Promise.all([
      this.db.member.findFirst({
        where: { organizationId: orgId, userId: context.userId as string },
        select: { role: true },
      }),
      this.subscriptions.isFeatureEnabled(orgId, 'brain'),
    ]);
    if (!enabled || !canManageOrg(member?.role)) {
      throw new NotFoundException('Not found');
    }
    return orgId;
  }

  /**
   * The single most useful next step, in a fixed order: nothing can be
   * curated before documents exist, a failed document is cheaper to retry
   * than to forget, candidates waiting are the queue, approved knowledge not
   * in the index helps nobody, and open findings are what is left.
   */
  async next(context: ApiContext): Promise<BrainNext> {
    const orgId = await this.assertAccess(context);
    const [documents, pages, failed, candidates, unpublished, findings] =
      await Promise.all([
        this.db.userFile.count({
          where: {
            organizationId: orgId,
            sourceFileId: null,
            publishedPages: { none: {} },
            OR: [{ document: { isNot: null } }, { documentId: { not: null } }],
          },
        }),
        this.db.knowledgePage.count({ where: { organizationId: orgId } }),
        this.db.knowledgeFinding.count({
          where: {
            organizationId: orgId,
            status: 'OPEN',
            type: 'EXTRACTION_FAILED',
          },
        }),
        this.db.knowledgePage.count({
          where: { organizationId: orgId, status: 'CANDIDATE' },
        }),
        this.db.knowledgePage.count({
          where: {
            organizationId: orgId,
            status: 'APPROVED',
            publishedAt: null,
          },
        }),
        this.db.knowledgeFinding.count({
          where: { organizationId: orgId, status: 'OPEN' },
        }),
      ]);

    if (documents === 0) {
      return {
        state: 'no-documents',
        message: 'No documents yet. Add documents to the knowledge base first.',
        path: '/knowledge',
        command: null,
      };
    }
    if (pages === 0) {
      return {
        state: 'extract',
        message: `${documents} documents, no knowledge pages yet. Start an extraction.`,
        path: '/brain',
        command: null,
      };
    }
    if (failed > 0) {
      return {
        state: 'retry',
        message: `${failed} documents failed to extract. Retry them from the findings list.`,
        path: '/brain/findings',
        command: 'ragen brain findings',
      };
    }
    if (candidates > 0) {
      return {
        state: 'review',
        message: `${candidates} candidate pages are waiting for review.`,
        path: '/brain?status=CANDIDATE',
        command: 'ragen brain pages --status CANDIDATE',
      };
    }
    if (unpublished > 0) {
      return {
        state: 'publish',
        message: `${unpublished} approved pages are not in the knowledge base yet. Publish them so answers can cite them.`,
        path: '/brain?status=APPROVED',
        command: null,
      };
    }
    if (findings > 0) {
      return {
        state: 'fix',
        message: `${findings} open findings.`,
        path: '/brain/findings',
        command: 'ragen brain findings',
      };
    }
    return {
      state: 'done',
      message: 'Everything is curated: no candidates, no open findings.',
      path: '/brain',
      command: 'ragen brain export ./brain',
    };
  }

  /** What is wrong with this organization's Brain, check by check. */
  async health(context: ApiContext): Promise<BrainCheck[]> {
    const orgId = await this.assertAccess(context);
    const stuckBefore = new Date(Date.now() - STUCK_AFTER_MS);
    const [stuck, lostFile, failed, unowned, noAccess, stale] =
      await Promise.all([
        this.db.knowledgePage.count({
          where: {
            organizationId: orgId,
            publishedAt: { not: null, lt: stuckBefore },
            publishedFile: { embeddingStatus: { not: 'COMPLETED' } },
          },
        }),
        this.db.knowledgePage.count({
          where: {
            organizationId: orgId,
            publishedAt: { not: null },
            publishedFileId: null,
          },
        }),
        this.db.knowledgeFinding.count({
          where: {
            organizationId: orgId,
            status: 'OPEN',
            type: 'EXTRACTION_FAILED',
          },
        }),
        this.db.knowledgePage.count({
          where: {
            organizationId: orgId,
            status: { in: ['APPROVED', 'STALE'] },
            ownerId: null,
          },
        }),
        this.db.knowledgePage.count({
          where: {
            organizationId: orgId,
            status: 'APPROVED',
            accessibleBy: { isEmpty: true },
          },
        }),
        this.db.knowledgeFinding.count({
          where: { organizationId: orgId, status: 'OPEN', type: 'STALE' },
        }),
      ]);
    const check = (
      name: string,
      count: number,
      status: 'warning' | 'error',
      what: string,
      hint: string,
    ): BrainCheck =>
      count === 0
        ? { name, status: 'ok', detail: `no ${what}`, hint: null }
        : { name, status, detail: `${count} ${what}`, hint };
    return [
      {
        name: 'brain',
        status: 'ok',
        detail: 'Brain is on for this organization',
        hint: null,
      },
      check(
        'publication',
        stuck,
        'error',
        'published pages still being written after 15 minutes',
        'Is the worker running? Publish the page again from the panel to resume.',
      ),
      check(
        'publication-file',
        lostFile,
        'error',
        'published pages without their file',
        'Withdraw and publish the page again.',
      ),
      check(
        'extraction',
        failed,
        'warning',
        'documents that failed to extract',
        'Retry them from the findings list: ragen brain findings',
      ),
      check(
        'owners',
        unowned,
        'warning',
        'approved pages without an owner',
        'Set an owner on each page.',
      ),
      check(
        'access',
        noAccess,
        'warning',
        'approved pages open to nobody',
        'Choose who may read them before publishing.',
      ),
      check(
        'staleness',
        stale,
        'warning',
        'stale pages',
        'Re-check them against their sources.',
      ),
    ];
  }

  async findings(
    context: ApiContext,
    status: 'OPEN' | 'RESOLVED' | 'DISMISSED',
  ) {
    const orgId = await this.assertAccess(context);
    const rows = await this.db.knowledgeFinding.findMany({
      where: { organizationId: orgId, status },
      orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
      take: 200,
      select: {
        publicId: true,
        type: true,
        severity: true,
        status: true,
        pageIds: true,
        fileId: true,
        detectedAt: true,
      },
    });
    const pageIds = [...new Set(rows.flatMap((r) => r.pageIds))];
    const pages = pageIds.length
      ? await this.db.knowledgePage.findMany({
          where: { organizationId: orgId, id: { in: pageIds } },
          select: { id: true, publicId: true, title: true },
        })
      : [];
    const byId = new Map(pages.map((p) => [p.id, p]));
    return rows.map((r) => ({
      id: r.publicId,
      type: r.type,
      severity: r.severity,
      status: r.status,
      detectedAt: r.detectedAt.toISOString(),
      pages: r.pageIds.flatMap((id) => {
        const p = byId.get(id);
        return p ? [{ id: p.publicId, title: p.title }] : [];
      }),
      fileId: r.fileId,
    }));
  }

  async pages(
    context: ApiContext,
    query: {
      q?: string;
      status?: 'CANDIDATE' | 'APPROVED' | 'REJECTED' | 'STALE';
    },
  ) {
    const orgId = await this.assertAccess(context);
    const rows = await this.db.knowledgePage.findMany({
      where: {
        organizationId: orgId,
        status: query.status ?? { not: 'REJECTED' },
        ...(query.q
          ? {
              OR: [
                { title: { contains: query.q, mode: 'insensitive' as const } },
                {
                  content: { contains: query.q, mode: 'insensitive' as const },
                },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: {
        publicId: true,
        title: true,
        type: true,
        status: true,
        publishedAt: true,
        updatedAt: true,
        owner: { select: { email: true } },
      },
    });
    return rows.map((p) => ({
      id: p.publicId,
      title: p.title,
      type: p.type,
      status: p.status,
      owner: p.owner?.email ?? null,
      published: p.publishedAt !== null,
      updatedAt: p.updatedAt.toISOString(),
    }));
  }

  async graph(
    context: ApiContext,
    query: {
      focus?: string;
      hops?: string;
      budget?: string;
      inferred?: string;
    },
  ) {
    const orgId = await this.assertAccess(context);
    const [pages, edges, open] = await Promise.all([
      this.db.knowledgePage.findMany({
        where: { organizationId: orgId, status: { not: 'REJECTED' } },
        select: {
          id: true,
          publicId: true,
          title: true,
          type: true,
          status: true,
        },
      }),
      this.db.knowledgeEdge.findMany({
        where: { organizationId: orgId },
        select: {
          fromPageId: true,
          toPageId: true,
          kind: true,
          origin: true,
          confidence: true,
        },
      }),
      this.db.knowledgeFinding.findMany({
        where: { organizationId: orgId, status: 'OPEN' },
        select: { pageIds: true },
      }),
    ]);
    const publicOf = new Map(pages.map((p) => [p.id, p.publicId]));
    // Pages with open findings are pinned into the overview, as in the panel.
    const pinned = new Set(
      open.flatMap((f) => f.pageIds.flatMap((id) => publicOf.get(id) ?? [])),
    );
    const { graph } = assembleGraph(
      pages.map((p) => ({
        id: p.publicId,
        title: p.title,
        type: p.type,
        status: p.status,
      })),
      edges.flatMap((e) => {
        const from = publicOf.get(e.fromPageId);
        const to = publicOf.get(e.toPageId);
        return from && to
          ? [
              {
                from,
                to,
                kind: e.kind,
                origin: e.origin,
                confidence: e.confidence,
              },
            ]
          : [];
      }),
    );
    const budget = Number(query.budget);
    return selectGraphView(graph, {
      budget: (GRAPH_BUDGETS as readonly number[]).includes(budget)
        ? (budget as GraphBudget)
        : GRAPH_BUDGETS[0],
      focus: query.focus ?? null,
      hops: query.hops === '2' ? 2 : 1,
      includeInferred: query.inferred === '1' || query.inferred === 'true',
      pinned,
    });
  }

  /** The bundle as files, for the CLI to write to a directory. */
  async exportBundle(context: ApiContext) {
    const orgId = await this.assertAccess(context);
    const [pages, edges] = await Promise.all([
      this.db.knowledgePage.findMany({
        where: { organizationId: orgId, status: { not: 'REJECTED' } },
        select: {
          id: true,
          publicId: true,
          slug: true,
          title: true,
          type: true,
          status: true,
          content: true,
          contentHash: true,
          accessibleBy: true,
          validFrom: true,
          verifyEvery: true,
          lastVerifiedAt: true,
          lastVerifiedBy: true,
          owner: { select: { email: true } },
          supersededBy: { select: { publicId: true } },
          sources: {
            where: { organizationId: orgId },
            orderBy: { id: 'asc' },
            select: {
              fileId: true,
              documentVersionId: true,
              span: true,
              quote: true,
              hash: true,
              sourceDeletedAt: true,
            },
          },
        },
      }),
      this.db.knowledgeEdge.findMany({
        where: { organizationId: orgId },
        select: {
          fromPageId: true,
          toPageId: true,
          kind: true,
          origin: true,
          confidence: true,
        },
      }),
    ]);
    const publicOf = new Map(pages.map((p) => [p.id, p.publicId]));
    const bundle = buildBundle({
      organizationId: orgId,
      generatedAt: new Date(),
      pages: pages.map((p) => ({
        id: p.publicId,
        slug: p.slug,
        title: p.title,
        type: p.type,
        status: p.status,
        content: p.content,
        contentHash: p.contentHash,
        owner: p.owner?.email ?? null,
        accessibleBy: p.accessibleBy,
        validFrom: p.validFrom ? p.validFrom.toISOString().slice(0, 10) : null,
        supersededBy: p.supersededBy?.publicId ?? null,
        verifyEvery: p.verifyEvery,
        lastVerifiedAt: p.lastVerifiedAt?.toISOString() ?? null,
        lastVerifiedBy: p.lastVerifiedAt ? p.lastVerifiedBy : null,
        sources: p.sources.map((s) => ({
          ...s,
          sourceDeletedAt: s.sourceDeletedAt?.toISOString() ?? null,
        })),
      })),
      edges: edges.flatMap((e) => {
        const from = publicOf.get(e.fromPageId);
        const to = publicOf.get(e.toPageId);
        return from && to
          ? [
              {
                from,
                to,
                kind: e.kind,
                origin: e.origin,
                confidence: e.confidence,
              },
            ]
          : [];
      }),
    });
    return {
      files: Object.fromEntries(bundle.files),
      skipped: bundle.skipped,
    };
  }
}
