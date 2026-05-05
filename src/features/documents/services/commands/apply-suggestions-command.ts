import db from '@ragenai/prisma-client';
import { AiUsageStep } from '@/generated/prisma/client';
import { createDocumentVersionCommand } from './create-document-version-command';
import { applySuggestions } from '@/features/documents/services/rag-optimizer/suggestion-applier';
import { scoreDocument } from '@/features/documents/services/rag-optimizer/document-scorer';
import { createChatCompletionInstanceWithOrg } from '@/app/lib/services/llm';
import { trackAiUsage } from '@/features/ai-usage/services/commands/create-ai-usage-command';
import type {
  OptimizationSuggestion,
  ApplySuggestionsResult,
} from '@/features/documents/contracts/optimization-suggestion.types';
import type { RagScore } from '@/features/documents/contracts/rag-score.types';
import { logger } from '@/app/lib/utils/logger';

const SCORER_MODEL = 'gemini-2.5-flash';

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

  const startTime = Date.now();
  let newScore: RagScore | null = null;
  try {
    const model = await createChatCompletionInstanceWithOrg(
      { model: SCORER_MODEL, temperature: 0 },
      orgId,
      false,
    );
    newScore = await scoreDocument(newContent, model);
    const durationMs = Date.now() - startTime;
    void trackAiUsage({
      organizationId: orgId,
      step: AiUsageStep.CHAT_COMPLETION,
      provider: 'litellm',
      model: SCORER_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      durationMs,
      metadata: { feature: 'kb-apply-suggestions' },
    });
  } catch (err) {
    logger.error(
      { err },
      'Scoring after apply-suggestions failed, continuing without score',
    );
  }

  const newVersion = await createDocumentVersionCommand({
    documentId,
    content: newContent,
    title: doc.title,
    changeType: 'AI_OPTIMIZE',
    authorId,
    ragScore: newScore,
    comment: `Applied ${accepted.length} of ${suggestions.length} suggestions`,
  });

  await db.userDocument.updateMany({
    where: { id: documentId, organizationId: orgId },
    data: { content: newContent, updatedAt: new Date() },
  });

  logger.info(
    {
      documentId,
      accepted: accepted.length,
      total: suggestions.length,
      newScore: newScore?.total,
    },
    'Applied optimization suggestions',
  );

  return {
    newVersionId: newVersion.id,
    newVersionNumber: newVersion.versionNumber,
    newRagScore: newScore,
  };
}
