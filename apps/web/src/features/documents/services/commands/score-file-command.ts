import db from '@ragenai/prisma-client';
import { AiUsageStep } from '@/generated/prisma/client';
import { getFileFromS3 } from '@/app/lib/services/storage';
import { createChatCompletionInstanceWithOrg } from '@/app/lib/services/llm';
import { trackAiUsage } from '@/features/ai-usage/services/commands/create-ai-usage-command';
import { scoreDocument } from '@/features/documents/services/rag-optimizer/document-scorer';
import type { RagScore } from '@/features/documents/contracts/rag-score.types';
import { logger } from '@/app/lib/utils/logger';

const SCORER_MODEL = 'gemini-2.5-flash';

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'csv',
  'json',
  'html',
  'xml',
  'srt',
]);

export async function scoreFileCommand(
  fileId: string,
  orgId: string,
): Promise<RagScore> {
  const file = await db.userFile.findFirst({
    where: { id: fileId, organizationId: orgId },
    select: {
      id: true,
      fileExtension: true,
      metadata: true,
      document: { select: { content: true } },
    },
  });

  if (!file) {
    throw new Error('File not found');
  }

  let content: string;

  if (file.document?.content) {
    content = file.document.content;
  } else if (
    file.fileExtension &&
    TEXT_EXTENSIONS.has(file.fileExtension.toLowerCase())
  ) {
    const s3Key = `${file.id}.${file.fileExtension}`;
    const buffer = await getFileFromS3(s3Key);
    content = buffer.toString('utf-8');
  } else {
    throw new Error(
      'Content not extracted yet - scoring requires a text-based file or a processed document',
    );
  }

  if (!content.trim()) {
    throw new Error('File has no content to score');
  }

  const startTime = Date.now();
  const model = await createChatCompletionInstanceWithOrg(
    { model: SCORER_MODEL, temperature: 0 },
    orgId,
    false,
  );

  const score = await scoreDocument(content, model);
  const durationMs = Date.now() - startTime;

  const existingMetadata =
    file.metadata && typeof file.metadata === 'object' ? file.metadata : {};

  await db.userFile.update({
    where: { id: fileId, organizationId: orgId },
    data: {
      metadata: {
        ...(existingMetadata as Record<string, unknown>),
        ragScore: score,
        ragScoredAt: new Date().toISOString(),
      },
    },
  });

  void trackAiUsage({
    organizationId: orgId,
    step: AiUsageStep.CHAT_COMPLETION,
    provider: 'litellm',
    model: SCORER_MODEL,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    durationMs,
    metadata: { feature: 'kb-scorer' },
  });

  logger.info(
    { fileId, orgId, total: score.total, durationMs },
    'Document scored for RAG readiness',
  );

  return score;
}
