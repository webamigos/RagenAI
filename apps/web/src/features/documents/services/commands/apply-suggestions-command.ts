import db from '@ragenai/prisma-client';
import { assertCanManageDocuments } from '@/features/subscriptions/services/feature-guards';

import { createDocumentVersionCommand } from './create-document-version-command';
import { applySuggestions } from '@/features/documents/services/rag-optimizer/suggestion-applier';
import {
  optimizationSuggestionSchema,
  type ApplySuggestionsResult,
  type OptimizationSuggestion,
} from '@/features/documents/contracts/optimization-suggestion.types';
import { logger } from '@/app/lib/utils/logger';

type ApplySuggestionsInput = {
  documentId: string;
  orgId: string;
  authorId: string;
  acceptedSuggestionIds: string[];
  rejectedSuggestionIds: string[];
};

/**
 * Apply the accepted suggestions and record the result as a new version.
 *
 * The suggestion bodies are read from the stored job, not from the request.
 * The caller sends ids only: a version stamped AI_OPTIMIZE should contain what
 * the model actually proposed, and taking `before`/`after` from the browser
 * would let any client write arbitrary text under that label.
 */
export async function applySuggestionsCommand(
  input: ApplySuggestionsInput,
): Promise<ApplySuggestionsResult> {
  const {
    documentId,
    orgId,
    authorId,
    acceptedSuggestionIds,
    rejectedSuggestionIds,
  } = input;

  // Accepting a suggestion writes a new document version and re-embeds it —
  // a corpus mutation, reached without touching upload or delete, which are
  // the two paths the write restrictions actually gated.
  await assertCanManageDocuments(orgId);

  const doc = await db.userDocument.findFirst({
    where: { id: documentId, organizationId: orgId },
    select: { id: true, content: true, title: true, metadata: true },
  });

  if (!doc) {
    throw new Error('Document not found');
  }

  const stored = extractStoredSuggestions(doc.metadata);
  const accepted = stored.filter((s) => acceptedSuggestionIds.includes(s.id));

  if (accepted.length === 0) {
    throw new Error('No matching suggestions');
  }

  const { content: newContent, results } = applySuggestions(
    doc.content,
    accepted,
  );
  const appliedIds = new Set(results.filter((r) => r.applied).map((r) => r.id));
  const staleIds = accepted
    .map((s) => s.id)
    .filter((id) => !appliedIds.has(id));

  if (appliedIds.size === 0) {
    // Every accepted suggestion went stale — the document is unchanged, and a
    // version recording no change would be noise in the history.
    throw new Error('No suggestions could be applied');
  }

  // No ragScore: the re-index that follows rescores the document, and a number
  // copied from before the edit would be wrong for exactly as long as anyone
  // looked at it.
  const newVersion = await createDocumentVersionCommand({
    documentId,
    organizationId: orgId,
    content: newContent,
    title: doc.title,
    changeType: 'AI_OPTIMIZE',
    authorId,
    ragScore: null,
    comment: `Applied ${appliedIds.size} of ${accepted.length} accepted suggestions`,
  });

  await db.userDocument.updateMany({
    where: { id: documentId, organizationId: orgId },
    data: { content: newContent, updatedAt: new Date() },
  });

  // Suggestions the user neither accepted nor rejected stay on the job so the
  // tab still offers them. Ones that went stale are dropped: their `before` no
  // longer exists, so they can never apply.
  const decided = new Set([
    ...acceptedSuggestionIds,
    ...rejectedSuggestionIds,
    ...staleIds,
  ]);
  const remaining = stored.filter((s) => !decided.has(s.id));

  await writeRemainingSuggestions(documentId, orgId, remaining);

  logger.info(
    {
      documentId,
      accepted: accepted.length,
      applied: appliedIds.size,
      stale: staleIds.length,
    },
    'Applied optimization suggestions',
  );

  return {
    newVersionId: newVersion.id,
    newVersionNumber: newVersion.versionNumber,
    newRagScore: null,
  };
}

function extractStoredSuggestions(metadata: unknown): OptimizationSuggestion[] {
  const raw = (metadata as { optimizationJob?: { suggestions?: unknown } })
    ?.optimizationJob?.suggestions;

  if (!Array.isArray(raw)) {
    return [];
  }

  // Parsed rather than cast: this is JSONB written by another process, and a
  // shape change there should surface here rather than halfway through a
  // rewrite of someone's document.
  return raw.flatMap((entry) => {
    const parsed = optimizationSuggestionSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

async function writeRemainingSuggestions(
  documentId: string,
  orgId: string,
  remaining: OptimizationSuggestion[],
): Promise<void> {
  if (remaining.length === 0) {
    // `-` on a NULL metadata yields NULL rather than an error, so the COALESCE
    // keeps a document that never had metadata from having the column nulled.
    await db.$executeRaw`
      UPDATE user_documents
      SET metadata = COALESCE(metadata, '{}'::jsonb) - 'optimizationJob'
      WHERE id = ${documentId}::uuid
        AND organization_id = ${orgId}
    `;
    return;
  }

  await db.$executeRaw`
    UPDATE user_documents
    SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{optimizationJob,suggestions}',
      ${JSON.stringify(remaining)}::jsonb
    )
    WHERE id = ${documentId}::uuid
      AND organization_id = ${orgId}
  `;
}
