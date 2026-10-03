import { resolveAnswerFromDocumentsOnly } from '@ragenai/platform-contracts';
import db from '@ragenai/prisma-client';

/**
 * Whether this assistant answers only from its documents, for the chat
 * surfaces that build the answer prompt (spec
 * 2026-10-03-retrieval-claims-match-the-product-before-launch, Phase C2).
 *
 * Both ids come from the server — a thread record, a public project resolved
 * by its access token — never from the request body, and the read is scoped by
 * organization like every other project read. A project that is not found in
 * that organization keeps today's rule: there is no assistant whose setting
 * could apply, and refusing every answer is not a safer default for a project
 * nobody can see.
 */
export async function getAnswerFromDocumentsOnlyQuery(
  projectId: string,
  organizationId: string,
): Promise<boolean> {
  const project = await db.project.findFirst({
    where: { id: projectId, organizationId },
    select: {
      chatbotEnabled: true,
      settings: { select: { answerFromDocumentsOnly: true } },
    },
  });

  if (!project) {
    return false;
  }

  return resolveAnswerFromDocumentsOnly({
    setting: project.settings?.answerFromDocumentsOnly,
    chatbotEnabled: project.chatbotEnabled,
  });
}
