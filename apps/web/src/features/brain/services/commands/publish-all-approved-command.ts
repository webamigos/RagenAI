import 'server-only';

import db from '@ragenai/prisma-client';

import type { ReviewError } from '../../contracts/brain-review.types';
import { publishKnowledgePageCommand } from './publish-knowledge-page-command';

export type PublishAllResult = {
  /** Pages queued into the index: new, or changed since they were published. */
  queued: number;
  /** Already serving this exact content — nothing written. */
  unchanged: number;
  /** Refused, by reason: no owner, open to nobody, a principal gone… */
  refused: Partial<Record<ReviewError, number>>;
};

/** At most this many pages in one run from the panel. */
export const PUBLISH_ALL_LIMIT = 500;

/**
 * Publish every approved page whose content is not already serving (spec
 * E7, re-publication by diff).
 *
 * The diff is the page's `contentHash` against the one recorded on its
 * published file: a page that serves its current text writes nothing, a
 * changed page is re-embedded, a new one is published. Each page goes through
 * `publishKnowledgePageCommand` — the same transaction, the same checks, the
 * same ledger row as publishing it by hand — so "publish all" is a loop and
 * not a second publication path with rules of its own. A page it cannot
 * publish is counted by reason rather than failing the rest.
 *
 * What was removed is not deleted here: a page leaves the index by being
 * withdrawn, a person's decision, never as the side effect of a bulk run.
 */
export async function publishAllApprovedCommand(input: {
  orgId: string;
  actorId: string;
}): Promise<PublishAllResult> {
  const pages = await db.knowledgePage.findMany({
    where: { organizationId: input.orgId, status: 'APPROVED' },
    select: { publicId: true, updatedAt: true },
    orderBy: { id: 'asc' },
    take: PUBLISH_ALL_LIMIT,
  });
  const result: PublishAllResult = { queued: 0, unchanged: 0, refused: {} };
  for (const page of pages) {
    const outcome = await publishKnowledgePageCommand({
      orgId: input.orgId,
      actorId: input.actorId,
      publicId: page.publicId,
      expectedUpdatedAt: page.updatedAt.toISOString(),
    });
    if (outcome.success) {
      if (outcome.changed) {
        result.queued += 1;
      } else {
        result.unchanged += 1;
      }
    } else {
      result.refused[outcome.error] = (result.refused[outcome.error] ?? 0) + 1;
    }
  }
  return result;
}
