import db from '@ragenai/prisma-client';
import { createDocumentVersionCommand } from './create-document-version-command';
import { applySuggestions } from '@/features/documents/services/rag-optimizer/suggestion-applier';
import type {
  OptimizationSuggestion,
  ApplySuggestionsResult,
} from '@/features/documents/contracts/optimization-suggestion.types';
import { logger } from '@/app/lib/utils/logger';

type ApplySuggestionsInput = {
  documentId: string;
  orgId: string;
  authorId: string;
  acceptedSuggestionIds: string[];
  suggestions: OptimizationSuggestion[];
};

export async function applySuggestionsCommand(
  input: ApplySuggestionsInput,
): Promise<ApplySuggestionsResult> {
  const { documentId, orgId, authorId, acceptedSuggestionIds, suggestions } =
    input;

  const doc = await db.userDocument.findFirst({
    where: { id: documentId, organizationId: orgId },
    select: { id: true, content: true, title: true },
  });

  if (!doc) {
    throw new Error('Document not found');
  }

  const accepted = suggestions.filter((s) =>
    acceptedSuggestionIds.includes(s.id),
  );
  const newContent = applySuggestions(doc.content, accepted);

  // Version is created without ragScore — worker will update it after re-embedding
  const newVersion = await createDocumentVersionCommand({
    documentId,
    content: newContent,
    title: doc.title,
    changeType: 'AI_OPTIMIZE',
    authorId,
    ragScore: null,
    comment: `Applied ${accepted.length} of ${suggestions.length} suggestions`,
  });

  await db.userDocument.updateMany({
    where: { id: documentId, organizationId: orgId },
    data: { content: newContent, updatedAt: new Date() },
  });

  logger.info(
    { documentId, accepted: accepted.length, total: suggestions.length },
    'Applied optimization suggestions',
  );

  return {
    newVersionId: newVersion.id,
    newVersionNumber: newVersion.versionNumber,
    newRagScore: null,
  };
}
