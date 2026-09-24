import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

/**
 * The display name of a member of `organizationId`, for a notification's
 * "{name} shared …" sentence. Read through the membership, so a user id from
 * another organization yields nothing. A read only — Better Auth owns these
 * tables, and nothing here writes them.
 *
 * Never throws: a notification decorates a share, and a failed read must not
 * fail it. The sentence is then rendered without a name.
 *
 * apps/api has the same read as `NotificationsService.memberDisplayName`.
 */
export async function getMemberDisplayNameQuery(
  userId: string,
  organizationId: string,
): Promise<string | undefined> {
  try {
    const member = await db.member.findFirst({
      where: { userId, organizationId },
      select: { user: { select: { name: true } } },
    });
    const name = member?.user.name?.trim();
    return name ? name : undefined;
  } catch (err) {
    logger.warn(
      { err, organizationId },
      "Could not read a sharer's name for a notification",
    );
    return undefined;
  }
}
