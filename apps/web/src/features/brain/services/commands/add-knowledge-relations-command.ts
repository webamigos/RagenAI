import 'server-only';
import db from '@ragenai/prisma-client';
import { Prisma } from '@/generated/prisma/client';
import type {
  AddRelationsInput,
  ReviewResult,
} from '../../contracts/brain-review.types';
import { startFindingsReconcile } from './start-findings-reconcile';

/** A curator confirms proposed relations; they remain INFERRED, never source evidence. */
export async function addKnowledgeRelationsCommand(
  input: AddRelationsInput & { orgId: string; actorId: string },
): Promise<ReviewResult> {
  if (input.targets.some((target) => target.publicId === input.publicId)) {
    return { success: false, error: 'invalid-input' };
  }
  const publicIds = [
    ...new Set([
      input.publicId,
      ...input.targets.map((target) => target.publicId),
    ]),
  ].sort();
  const result = await db.$transaction(async (tx): Promise<ReviewResult> => {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM knowledge_pages WHERE organization_id = ${input.orgId} AND public_id IN (${Prisma.join(publicIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`,
    );
    const pages = await tx.knowledgePage.findMany({
      where: { organizationId: input.orgId, publicId: { in: publicIds } },
      select: { id: true, publicId: true, status: true, updatedAt: true },
    });
    if (pages.length !== publicIds.length) {
      return { success: false, error: 'not-found' };
    }
    if (pages.some((page) => page.status === 'REJECTED')) {
      return { success: false, error: 'invalid-status' };
    }
    const source = pages.find((page) => page.publicId === input.publicId)!;
    const versions = new Map([
      [input.publicId, new Date(input.expectedUpdatedAt).toISOString()],
      ...input.targets.map(
        (target) =>
          [
            target.publicId,
            new Date(target.expectedUpdatedAt).toISOString(),
          ] as [string, string],
      ),
    ]);
    if (
      pages.some(
        (page) => page.updatedAt.toISOString() !== versions.get(page.publicId),
      )
    ) {
      return { success: false, error: 'conflict' };
    }
    const result = await tx.knowledgeEdge.createMany({
      data: input.targets.map((target) => ({
        organizationId: input.orgId,
        fromPageId: source.id,
        toPageId: pages.find((page) => page.publicId === target.publicId)!.id,
        kind: target.kind,
        origin: 'INFERRED' as const,
      })),
      skipDuplicates: true,
    });
    if (result.count) {
      await tx.knowledgePage.updateMany({
        where: {
          organizationId: input.orgId,
          id: { in: pages.map((page) => page.id) },
        },
        data: {
          updatedAt: new Date(
            Math.max(
              Date.now(),
              ...pages.map((page) => page.updatedAt.getTime() + 1),
            ),
          ),
        },
      });
    }
    return { success: true, changed: result.count > 0 };
  });
  if (result.success && result.changed) {
    await startFindingsReconcile(input.orgId);
  }
  return result;
}
