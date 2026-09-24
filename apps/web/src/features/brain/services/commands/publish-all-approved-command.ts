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
  /**
   * Recorded as published, but the index write could not be queued — the
   * queue was down. Not a refusal: the ledger says published and the index
   * does not, and running again is what closes the gap.
   */
  notWritten: number;
};

/**
 * Pages read per batch. A batch, not a cap: the run walks every approved
 * page. A cap by id order re-checked the same first pages on every run and
 * could never reach the rest.
 */
export const PUBLISH_ALL_BATCH = 500;

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
  const result: PublishAllResult = {
    queued: 0,
    unchanged: 0,
    refused: {},
    notWritten: 0,
  };
  let after = 0;
  for (;;) {
    const pages = await db.knowledgePage.findMany({
      where: {
        organizationId: input.orgId,
        status: 'APPROVED',
        id: { gt: after },
        // Serving, or never published. Not a withdrawn page: it keeps its
        // file and has no `publishedAt`, and a withdrawal is a person's
        // decision that only a person reverses — one bulk click must not.
        OR: [{ publishedAt: { not: null } }, { publishedFileId: null }],
      },
      select: { id: true, publicId: true, updatedAt: true },
      orderBy: { id: 'asc' },
      take: PUBLISH_ALL_BATCH,
    });
    if (pages.length === 0) {
      break;
    }
    after = pages[pages.length - 1]!.id;
    await publishBatch(input, pages, result);
    if (pages.length < PUBLISH_ALL_BATCH) {
      break;
    }
  }
  return result;
}

async function publishBatch(
  input: { orgId: string; actorId: string },
  pages: { publicId: string; updatedAt: Date }[],
  result: PublishAllResult,
): Promise<void> {
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
    } else if (outcome.error === 'failed-to-start') {
      result.notWritten += 1;
    } else {
      result.refused[outcome.error] = (result.refused[outcome.error] ?? 0) + 1;
    }
  }
}
