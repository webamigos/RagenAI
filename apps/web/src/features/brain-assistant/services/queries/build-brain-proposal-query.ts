import 'server-only';

import { randomUUID } from 'node:crypto';

import { intersectPrincipals, isWidening } from '@ragenai/brain-core';
import db from '@ragenai/prisma-client';

import type { AccessEntry } from '@/features/brain/contracts/brain.types';
import {
  accessEntries,
  principalIds,
} from '@/features/brain/utils/access-entries';

import type {
  BrainProposal,
  BrainProposalInput,
  ProposalPage,
} from '../../contracts/brain-assistant.types';

/**
 * Why a proposal was not shown. Returned to the model as the tool's result,
 * so it can say what it could not suggest — never shown as a card.
 */
export type ProposalRefusal =
  | 'unknown-page'
  | 'unknown-owner'
  | 'unknown-finding'
  | 'not-applicable'
  | 'same-page';

/**
 * Turn what the model proposed into what the card shows (spec "Acting").
 *
 * Every id is read again inside the organization; a page the organization
 * does not hold makes the proposal a refusal, never a card with a hole in
 * it. Each page is recorded with the `updatedAt` read here, which is what
 * Apply sends as `expectedUpdatedAt` — so a page someone else changed after
 * the assistant looked at it is refused by the command as `conflict`, the
 * same as a stale button would be.
 *
 * The status checks here are a courtesy, not the rule: approving a page that
 * is not a candidate is refused by the command whatever the card says. They
 * exist so the model is told at once that a suggestion does not apply,
 * instead of the operator discovering it on Apply.
 */
export async function buildBrainProposalQuery(
  orgId: string,
  input: BrainProposalInput,
): Promise<BrainProposal | ProposalRefusal> {
  const base = { id: randomUUID(), reason: input.reason, outcome: null };

  switch (input.action) {
    case 'APPROVE':
    case 'REJECT':
    case 'PUBLISH':
    case 'UNPUBLISH': {
      const rows = await readPages(orgId, input.pageIds);
      if (rows.length !== new Set(input.pageIds).size) {
        return 'unknown-page';
      }
      const applicable = rows.filter((row) => appliesTo(input.action, row));
      if (applicable.length === 0) {
        return 'not-applicable';
      }
      return {
        ...base,
        action: input.action,
        pages: applicable.map(toProposalPage),
        ...(input.action === 'PUBLISH'
          ? {
              audience: await Promise.all(
                applicable.map((row) => nameAccess(orgId, row.accessibleBy)),
              ),
            }
          : {}),
      };
    }
    case 'MERGE': {
      if (input.sourcePageId === input.targetPageId) {
        return 'same-page';
      }
      const rows = await readPages(orgId, [
        input.sourcePageId,
        input.targetPageId,
      ]);
      const source = rows.find((r) => r.publicId === input.sourcePageId);
      const target = rows.find((r) => r.publicId === input.targetPageId);
      if (!source || !target) {
        return 'unknown-page';
      }
      if (source.status !== 'CANDIDATE' || target.status === 'REJECTED') {
        return 'not-applicable';
      }
      const merged = intersectPrincipals(orgId, [
        source.accessibleBy,
        target.accessibleBy,
      ]);
      return {
        ...base,
        action: 'MERGE',
        source: toProposalPage(source),
        target: toProposalPage(target),
        preview: { access: await nameAccess(orgId, merged) },
      };
    }
    case 'SET_OWNER': {
      const [page] = await readPages(orgId, [input.pageId]);
      if (!page) {
        return 'unknown-page';
      }
      const member = await db.member.findFirst({
        where: { organizationId: orgId, userId: input.ownerId },
        select: { userId: true, user: { select: { name: true, email: true } } },
      });
      if (!member) {
        return 'unknown-owner';
      }
      return {
        ...base,
        action: 'SET_OWNER',
        page: toProposalPage(page),
        owner: {
          id: member.userId,
          name: member.user.name || member.user.email,
        },
      };
    }
    case 'SET_ACCESS': {
      const [page] = await readPages(orgId, [input.pageId]);
      if (!page) {
        return 'unknown-page';
      }
      const [before, after] = await Promise.all([
        nameAccess(orgId, page.accessibleBy),
        nameAccess(orgId, input.principals),
      ]);
      return {
        ...base,
        action: 'SET_ACCESS',
        page: toProposalPage(page),
        principals: input.principals,
        preview: {
          before,
          after,
          widens: isWidening(orgId, page.accessibleBy, input.principals),
        },
      };
    }
    case 'RETRY_EXTRACTION': {
      const finding = await db.knowledgeFinding.findFirst({
        where: {
          organizationId: orgId,
          publicId: input.findingId,
          type: 'EXTRACTION_FAILED',
          status: 'OPEN',
        },
        select: { publicId: true, fileId: true },
      });
      if (!finding) {
        return 'unknown-finding';
      }
      const file = finding.fileId
        ? await db.userFile.findFirst({
            where: { organizationId: orgId, id: finding.fileId },
            select: { fileName: true },
          })
        : null;
      return {
        ...base,
        action: 'RETRY_EXTRACTION',
        finding: {
          publicId: finding.publicId,
          fileName: file?.fileName ?? null,
        },
      };
    }
  }
}

type PageRow = {
  publicId: string;
  title: string;
  status: 'CANDIDATE' | 'APPROVED' | 'REJECTED' | 'STALE';
  updatedAt: Date;
  publishedAt: Date | null;
  ownerId: string | null;
  accessibleBy: string[];
};

async function readPages(orgId: string, publicIds: string[]) {
  const rows: PageRow[] = await db.knowledgePage.findMany({
    where: { organizationId: orgId, publicId: { in: [...new Set(publicIds)] } },
    select: {
      publicId: true,
      title: true,
      status: true,
      updatedAt: true,
      publishedAt: true,
      ownerId: true,
      accessibleBy: true,
    },
  });
  // In the order the model named them, which is the order the card lists.
  const order = new Map(publicIds.map((id, i) => [id, i]));
  return rows.sort(
    (a, b) => (order.get(a.publicId) ?? 0) - (order.get(b.publicId) ?? 0),
  );
}

/** Whether the action is one this page's state admits (see the command for the rule). */
function appliesTo(
  action: 'APPROVE' | 'REJECT' | 'PUBLISH' | 'UNPUBLISH',
  row: PageRow,
): boolean {
  switch (action) {
    case 'APPROVE':
      return row.status === 'CANDIDATE' && row.ownerId !== null;
    case 'REJECT':
      return row.status === 'CANDIDATE';
    case 'PUBLISH':
      return row.status === 'APPROVED';
    case 'UNPUBLISH':
      return row.publishedAt !== null;
  }
}

function toProposalPage(row: PageRow): ProposalPage {
  return {
    publicId: row.publicId,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Principals named for the card, as the page view names them. */
export async function nameAccess(
  orgId: string,
  principals: ReadonlyArray<string>,
): Promise<AccessEntry[]> {
  const { userIds, teamIds } = principalIds(principals);
  const [users, teams] = await Promise.all([
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
  ]);
  return accessEntries(orgId, principals, {
    users: new Map(users.map((m) => [m.userId, m.user.name || m.user.email])),
    teams: new Map(teams.map((t) => [t.id, t.name])),
  });
}
