import db from '@ragenai/prisma-client';

import type {
  KnowledgeDecisionView,
  KnowledgeEdgeView,
  KnowledgePageDetail,
  KnowledgePageSourceView,
  SourceState,
} from '../../contracts/brain.types';
import { accessEntries, principalIds } from '../../utils/access-entries';
import { getPageFindingsQuery } from './get-knowledge-findings-query';

/**
 * One knowledge page as a curator reviews it (spec D1): the page, who it is
 * open to, every source it cites with the state of that source now, its
 * relations, its open findings, and its ledger (D2).
 *
 * `publicId` is the URL's; the page is looked up with the organization in the
 * same `where`, so another organization's id answers null, not a page.
 *
 * **A source's state is read, not stored.** `newer-version` means the
 * document's active version is no longer the one the citation is pinned to —
 * the quote shown is still the pinned text the curator read, which is what
 * makes the citation reproducible (spec, `KnowledgePageSource`).
 */
export async function getKnowledgePageQuery(
  orgId: string,
  publicId: string,
): Promise<KnowledgePageDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(publicId)) {
    return null;
  }
  const page = await db.knowledgePage.findFirst({
    where: { organizationId: orgId, publicId },
    select: {
      id: true,
      publicId: true,
      title: true,
      type: true,
      status: true,
      content: true,
      accessibleBy: true,
      publishedAt: true,
      lastVerifiedAt: true,
      verifyEvery: true,
      updatedAt: true,
      ownerId: true,
      owner: { select: { name: true, email: true } },
      sources: {
        where: { organizationId: orgId },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          fileId: true,
          documentVersionId: true,
          span: true,
          quote: true,
          sourceDeletedAt: true,
        },
      },
      edgesFrom: {
        where: { organizationId: orgId },
        select: {
          kind: true,
          origin: true,
          toPage: { select: { publicId: true, title: true } },
        },
      },
      edgesTo: {
        where: { organizationId: orgId },
        select: {
          kind: true,
          origin: true,
          fromPage: { select: { publicId: true, title: true } },
        },
      },
      decisions: {
        where: { organizationId: orgId },
        orderBy: { id: 'desc' },
        take: DECISIONS_SHOWN,
        select: { action: true, actorId: true, createdAt: true },
      },
    },
  });
  if (!page) {
    return null;
  }

  const fileIds = [...new Set(page.sources.map((s) => s.fileId))];
  const pinnedIds = [...new Set(page.sources.map((s) => s.documentVersionId))];
  const { userIds, teamIds } = principalIds(page.accessibleBy);
  const actorIds = [...new Set(page.decisions.map((d) => d.actorId))];

  const [files, pinned, users, teams, findings, actors] = await Promise.all([
    fileIds.length
      ? db.userFile.findMany({
          where: { organizationId: orgId, id: { in: fileIds } },
          select: {
            id: true,
            fileName: true,
            documentId: true,
            document: { select: { id: true } },
          },
        })
      : [],
    pinnedIds.length
      ? db.documentVersion.findMany({
          where: { organizationId: orgId, id: { in: pinnedIds } },
          select: { id: true, versionNumber: true },
        })
      : [],
    userIds.length
      ? db.member.findMany({
          where: { organizationId: orgId, userId: { in: userIds } },
          select: {
            userId: true,
            user: { select: { name: true, email: true } },
          },
        })
      : [],
    teamIds.length
      ? db.team.findMany({
          where: { organizationId: orgId, id: { in: teamIds } },
          select: { id: true, name: true },
        })
      : [],
    getPageFindingsQuery(orgId, page.id),
    // Users, not members: the ledger names who acted after they have left,
    // and a former member's name is still the answer to "who approved this".
    actorIds.length
      ? db.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true },
        })
      : [],
  ]);

  // The document is the one whose `fileId` is this file — the relation.
  // `UserFile.documentId` is a copy ingest writes afterwards
  // (`bindFileWithDocument`), and a file can have the document without it.
  const documentOf = (f: (typeof files)[number]) =>
    f.document?.id ?? f.documentId ?? null;
  const documentIds = files.flatMap((f) => {
    const id = documentOf(f);
    return id ? [id] : [];
  });
  const active = documentIds.length
    ? await db.documentVersion.findMany({
        where: {
          organizationId: orgId,
          documentId: { in: documentIds },
          isActive: true,
        },
        select: { id: true, documentId: true },
      })
    : [];

  const fileById = new Map(files.map((f) => [f.id, f]));
  const activeByDocument = new Map(active.map((v) => [v.documentId, v.id]));
  const versionNumber = new Map(pinned.map((v) => [v.id, v.versionNumber]));

  const sources: KnowledgePageSourceView[] = page.sources.map((s) => {
    const file = fileById.get(s.fileId);
    let state: SourceState = 'current';
    if (s.sourceDeletedAt !== null || !file) {
      state = 'deleted';
    } else {
      const documentId = documentOf(file);
      const activeId = documentId
        ? activeByDocument.get(documentId)
        : undefined;
      if (activeId && activeId !== s.documentVersionId) {
        state = 'newer-version';
      }
    }
    return {
      id: s.id,
      span: s.span,
      quote: s.quote,
      state,
      fileName: file?.fileName ?? null,
      documentId: state === 'deleted' || !file ? null : documentOf(file),
      pinnedVersion: versionNumber.get(s.documentVersionId) ?? null,
    };
  });

  const edges: KnowledgeEdgeView[] = [
    ...page.edgesFrom.map((e) => ({
      direction: 'out' as const,
      kind: e.kind,
      origin: e.origin,
      page: e.toPage,
    })),
    ...page.edgesTo.map((e) => ({
      direction: 'in' as const,
      kind: e.kind,
      origin: e.origin,
      page: e.fromPage,
    })),
  ];

  const actorName = new Map(actors.map((u) => [u.id, u.name || u.email]));
  const decisions: KnowledgeDecisionView[] = page.decisions.map((d) => ({
    action: d.action,
    actorName: actorName.get(d.actorId) ?? null,
    createdAt: d.createdAt.toISOString(),
  }));

  return {
    publicId: page.publicId,
    title: page.title,
    type: page.type,
    status: page.status,
    content: page.content,
    ownerId: page.ownerId,
    ownerName: page.owner ? (page.owner.name ?? page.owner.email) : null,
    principals: page.accessibleBy,
    access: accessEntries(orgId, page.accessibleBy, {
      users: new Map(users.map((m) => [m.userId, m.user.name ?? m.user.email])),
      teams: new Map(teams.map((t) => [t.id, t.name])),
    }),
    published: page.publishedAt !== null,
    lastVerifiedAt: page.lastVerifiedAt?.toISOString() ?? null,
    verifyEvery: page.verifyEvery,
    updatedAt: page.updatedAt.toISOString(),
    sources,
    edges,
    findings,
    decisions,
  };
}

/** The ledger rows the page view shows; the rest are in the database. */
const DECISIONS_SHOWN = 20;
