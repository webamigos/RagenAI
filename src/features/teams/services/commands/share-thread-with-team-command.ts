'use server';

import db from '@ragenai/prisma-client';

type OperationResult = { success: true } | { success: false; error: string };

export async function shareThreadWithTeamCommand(
  threadId: string,
  teamId: string | null,
  organizationId: string,
  userId: string,
): Promise<OperationResult> {
  const thread = await db.thread.findFirst({
    where: {
      id: threadId,
      organizationId: organizationId,
    },
    select: { id: true, visitorId: true },
  });

  if (!thread) {
    return { success: false, error: 'Thread not found' };
  }

  if (thread.visitorId !== userId) {
    return { success: false, error: 'Only the thread creator can share it' };
  }

  if (teamId !== null) {
    if (!teamId) {
      return { success: false, error: 'Invalid team ID' };
    }

    // Verify the team exists in this org and the user is a member
    const membership = await db.teamMember.findFirst({
      where: {
        teamId,
        userId,
        team: { organizationId },
      },
    });

    if (!membership) {
      return {
        success: false,
        error: 'You must be a member of the team to share with it',
      };
    }
  }

  await db.thread.update({
    where: { id: thread.id },
    data: { teamId: teamId },
  });

  return { success: true };
}
