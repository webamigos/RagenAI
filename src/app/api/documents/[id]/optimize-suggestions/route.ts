import { NextResponse, type NextRequest } from 'next/server';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { createChatCompletionInstanceWithOrg } from '@/app/lib/services/llm';
import { generateSuggestions } from '@/features/documents/services/rag-optimizer/suggestion-generator';
import { AiUsageStep } from '@/generated/prisma/client';
import { trackAiUsage } from '@/features/ai-usage/services/commands/create-ai-usage-command';
import { getFileFromS3 } from '@/app/lib/services/storage';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';

const SUGGESTION_MODEL = 'claude-sonnet-4-6';
const UNSUPPORTED_TYPES = new Set(['IMAGE', 'XLSX', 'CSV']);

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let orgId: string;
  try {
    orgId = await getOrgIdFromAuthOrThrow();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const file = await db.userFile.findFirst({
    where: { documentId: id, organizationId: orgId },
    select: {
      id: true,
      fileType: true,
      fileExtension: true,
      document: { select: { id: true, content: true } },
    },
  });

  const doc =
    file?.document ??
    (await db.userDocument.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, content: true },
    }));

  if (!doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (file && UNSUPPORTED_TYPES.has(file.fileType)) {
    return NextResponse.json(
      { error: 'File type not supported for optimization' },
      { status: 422 },
    );
  }

  let content: string;
  if (file?.document?.content) {
    content = file.document.content;
  } else if (doc.content) {
    content = doc.content;
  } else if (file && file.fileExtension) {
    try {
      const buffer = await getFileFromS3(`${file.id}.${file.fileExtension}`);
      content = buffer.toString('utf-8');
    } catch {
      return NextResponse.json(
        { error: 'Failed to extract file content' },
        { status: 500 },
      );
    }
  } else {
    return NextResponse.json(
      { error: 'No content available' },
      { status: 422 },
    );
  }

  const encoder = new TextEncoder();
  const startTime = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const model = await createChatCompletionInstanceWithOrg(
          { model: SUGGESTION_MODEL, temperature: 0.2 },
          orgId,
          false,
        );

        const suggestions = await generateSuggestions(content, model);

        for (const suggestion of suggestions) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ suggestion })}\n\n`),
          );
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();

        const durationMs = Date.now() - startTime;
        void trackAiUsage({
          organizationId: orgId,
          step: AiUsageStep.CHAT_COMPLETION,
          provider: 'litellm',
          model: SUGGESTION_MODEL,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          durationMs,
          metadata: {
            feature: 'kb-optimize-suggestions',
            suggestionCount: suggestions.length,
          },
        });
      } catch (err) {
        logger.error({ err }, 'Failed to generate optimization suggestions');
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: 'Generation failed' })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
