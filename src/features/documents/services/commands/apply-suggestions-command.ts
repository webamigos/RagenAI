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
  rejectedSuggestionIds: string[];
  suggestions: OptimizationSuggestion[];
};

export async function applySuggestionsCommand(
  input: ApplySuggestionsInput,
): Promise<ApplySuggestionsResult> {
  const {
    documentId,
    orgId,
    authorId,
    acceptedSuggestionIds,
    rejectedSuggestionIds,
    suggestions,
  } = input;

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

  // Keep only undecided suggestions in the job so the tab shows them on next visit.
  // Accepted ones were just applied; rejected ones the user explicitly dismissed.
  const decidedIds = new Set([
    ...acceptedSuggestionIds,
    ...rejectedSuggestionIds,
  ]);
  const remaining = suggestions.filter((s) => !decidedIds.has(s.id));

  if (remaining.length === 0) {
    await db.$executeRaw`
      UPDATE user_documents
      SET metadata = metadata - 'optimizationJob'
      WHERE id = ${documentId}
        AND organization_id = ${orgId}
    `;
  } else {
    await db.$executeRaw`
      UPDATE user_documents
      SET metadata = jsonb_set(
        metadata,
        '{optimizationJob,suggestions}',
        ${JSON.stringify(remaining)}::jsonb
      )
      WHERE id = ${documentId}
        AND organization_id = ${orgId}
    `;
  }

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
