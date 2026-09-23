import 'server-only';

import { randomUUID } from 'node:crypto';

import { PUBLISHED_FILE_METADATA_KEY } from '@ragenai/brain-contracts';
import db from '@ragenai/prisma-client';

import { logger } from '@/app/lib/utils/logger';
import { jobs } from '@/libs/jobs';

import type {
  PageDecisionInput,
  ReviewError,
  ReviewResult,
} from '../../contracts/brain-review.types';
import { normalizeAccess, sameAccess } from '../../utils/normalize-access';
import { isOrgMember } from './decide-on-knowledge-page';
import { startFindingsReconcile } from './start-findings-reconcile';

/**
 * Put an approved page into the index (spec E2).
 *
 * One transaction — lock the page, bump `publicationGeneration`, set
 * `publishedAt`, create the page's `UserFile` on first publication (never
 * again: it outlives every withdrawal, see the spec's "Withdrawal"), record
 * `PUBLISH` with the new generation — and then the worker writes the chunks
 * (`brainPublishPage`), only while that generation is current. Chunks are
 * never written before `publishedAt`, so retrieval never holds a page its
 * row says is not published.
 *
 * Only an approved page with an owner who is still a member, and with a
 * non-empty access list whose every principal still matches someone here —
 * those principals go onto the chunks verbatim.
 *
 * **A retry continues rather than restarts.** A page already published at
 * this content whose index write has not completed is re-queued at its
 * current generation, with no new decision: bumping again would mint a second
 * `PUBLISH` row for one act, which the ledger's uniqueness exists to prevent.
 * A page already published and complete at this content writes nothing.
 */
export async function publishKnowledgePageCommand(
  input: PageDecisionInput & { orgId: string; actorId: string },
): Promise<ReviewResult> {
  const { orgId, actorId, publicId } = input;
  const outcome = await db.$transaction(
    async (
      tx,
    ): Promise<
      | { error: ReviewError }
      | { generation: number; changed: boolean; queue: boolean }
    > => {
      const locked = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM knowledge_pages
        WHERE public_id = ${publicId}::uuid AND organization_id = ${orgId}
        FOR UPDATE
      `;
      const id = locked[0]?.id;
      if (id === undefined) {
        return { error: 'not-found' };
      }
      const page = await tx.knowledgePage.findFirst({
        where: { organizationId: orgId, id },
        select: {
          id: true,
          slug: true,
          title: true,
          status: true,
          content: true,
          contentHash: true,
          ownerId: true,
          accessibleBy: true,
          publishedAt: true,
          publicationGeneration: true,
          publishedFileId: true,
          updatedAt: true,
          publishedFile: { select: { embeddingStatus: true, metadata: true } },
        },
      });
      if (!page) {
        return { error: 'not-found' };
      }
      if (
        page.updatedAt.toISOString() !==
        new Date(input.expectedUpdatedAt).toISOString()
      ) {
        return { error: 'conflict' };
      }
      if (page.status !== 'APPROVED') {
        return { error: 'invalid-status' };
      }
      if (page.ownerId === null) {
        return { error: 'owner-required' };
      }
      if (!(await isOrgMember(tx, orgId, page.ownerId))) {
        return { error: 'owner-not-member' };
      }
      if (page.accessibleBy.length === 0) {
        return { error: 'no-access' };
      }
      const userIds = page.accessibleBy
        .filter((p) => p.startsWith('user:'))
        .map((p) => p.slice(5));
      const teamIds = page.accessibleBy
        .filter((p) => p.startsWith('team:'))
        .map((p) => p.slice(5));
      const [members, teams] = await Promise.all([
        userIds.length
          ? tx.member.findMany({
              where: { organizationId: orgId, userId: { in: userIds } },
              select: { userId: true },
            })
          : [],
        teamIds.length
          ? tx.team.findMany({
              where: { organizationId: orgId, id: { in: teamIds } },
              select: { id: true },
            })
          : [],
      ]);
      const valid = normalizeAccess(orgId, page.accessibleBy, {
        memberIds: new Set(members.map((m) => m.userId)),
        teamIds: new Set(teams.map((t) => t.id)),
      });
      if (valid === null || !sameAccess(valid, page.accessibleBy)) {
        return { error: 'invalid-access' };
      }

      const published = publishedHash(page.publishedFile?.metadata);
      if (page.publishedAt && published === page.contentHash) {
        const complete = page.publishedFile?.embeddingStatus === 'COMPLETED';
        return {
          generation: page.publicationGeneration,
          changed: false,
          queue: !complete,
        };
      }

      const generation = page.publicationGeneration + 1;
      const metadata = {
        [PUBLISHED_FILE_METADATA_KEY]: {
          pageId: publicId,
          contentHash: page.contentHash,
          publicationGeneration: generation,
        },
      };
      let fileId = page.publishedFileId;
      if (fileId === null) {
        const file = await tx.userFile.create({
          data: {
            organizationId: orgId,
            fileName: vehicleFileName(page.title),
            fileSize: Buffer.byteLength(page.content, 'utf8'),
            fileType: 'MARKDOWN',
            isBinaryFile: false,
            isUploaded: true,
            uploadedAt: new Date(),
            ownerId: page.ownerId,
            isOrgWide: page.accessibleBy.includes(`org:${orgId}`),
            embeddingStatus: 'STARTED',
            metadata,
          },
          select: { id: true },
        });
        fileId = file.id;
      } else {
        await tx.userFile.updateMany({
          where: { organizationId: orgId, id: fileId },
          data: {
            fileName: vehicleFileName(page.title),
            fileSize: Buffer.byteLength(page.content, 'utf8'),
            // The file's sharing follows the page on every publication, not
            // only the first: a page withdrawn, narrowed and published again
            // otherwise kept an org-wide file, and a former owner kept it too.
            ownerId: page.ownerId,
            isOrgWide: page.accessibleBy.includes(`org:${orgId}`),
            embeddingStatus: 'STARTED',
            metadata,
          },
        });
      }
      await tx.knowledgePage.updateMany({
        where: { organizationId: orgId, id: page.id },
        data: {
          publishedAt: new Date(),
          publishedFileId: fileId,
          publicationGeneration: generation,
        },
      });
      await tx.knowledgeDecision.create({
        data: {
          organizationId: orgId,
          pageId: page.id,
          actorId,
          action: 'PUBLISH',
          publicationGeneration: generation,
          before: { publishedAt: page.publishedAt?.toISOString() ?? null },
          after: { contentHash: page.contentHash, fileId },
        },
      });
      return { generation, changed: true, queue: true };
    },
  );

  if ('error' in outcome) {
    return { success: false, error: outcome.error };
  }
  if (outcome.queue) {
    try {
      // A fresh run id every time. A queue remembers ids it has finished
      // (BullMQ skips a job whose id it has seen), so a deterministic id
      // silently dropped a publication once the same generation came round
      // again — after a database reset. Duplicates are harmless: the worker
      // writes only while its generation is current.
      await jobs().start(
        'brainPublishPage',
        `brain-publish-${publicId}-${outcome.generation}-${randomUUID()}`,
        { orgId, pageId: publicId, generation: outcome.generation },
      );
    } catch (error) {
      logger.error(
        {
          orgId,
          pageId: publicId,
          error: error instanceof Error ? error.message : String(error),
        },
        'brain: publication recorded but the index write could not be queued',
      );
      return { success: false, error: 'failed-to-start' };
    }
  }
  if (outcome.changed) {
    await startFindingsReconcile(orgId);
  }
  return { success: true, changed: outcome.changed || outcome.queue };
}

/**
 * The name a reader sees when an answer cites the page: its title, not its
 * slug. The file's name is copied onto every chunk (`file_name`), and the
 * chat's source list shows exactly that.
 */
export function vehicleFileName(title: string): string {
  return (
    title
      .replace(/[\p{Cc}/\\]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200) || 'Brain'
  );
}

function publishedHash(metadata: unknown): string | null {
  if (metadata && typeof metadata === 'object') {
    const block = (metadata as Record<string, unknown>)[
      PUBLISHED_FILE_METADATA_KEY
    ];
    if (block && typeof block === 'object' && 'contentHash' in block) {
      const hash = (block as { contentHash: unknown }).contentHash;
      return typeof hash === 'string' ? hash : null;
    }
  }
  return null;
}
