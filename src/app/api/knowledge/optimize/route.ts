import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { AiUsageStep } from '@/generated/prisma/client';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { createChatCompletionInstanceWithOrg } from '@/app/lib/services/llm';
import { generateOptimizedDocument } from '@/features/documents/services/rag-optimizer/document-generator';
import { trackAiUsage } from '@/features/ai-usage/services/commands/create-ai-usage-command';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';

const MAX_CONTENT_LENGTH = 100_000;
const GENERATOR_MODEL = 'gemini-2.5-flash';

const requestSchema = z.object({
  content: z.string().trim().min(10).max(MAX_CONTENT_LENGTH),
});

export async function POST(request: NextRequest) {
  let orgId: string;
  try {
    orgId = await getOrgIdFromAuthOrThrow();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: z.infer<typeof requestSchema>;
  try {
    const raw = await request.json();
    body = requestSchema.parse(raw);
  } catch {
    return NextResponse.json(
      { error: 'Invalid request. Content must be 10-100,000 characters.' },
      { status: 400 },
    );
  }

  const signal = request.signal;

  try {
    const startTime = Date.now();
    const model = await createChatCompletionInstanceWithOrg(
      { model: GENERATOR_MODEL, temperature: 0.3 },
      orgId,
      true,
    );

    const result = generateOptimizedDocument(body.content, model);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.textStream) {
            if (signal.aborted) {
              controller.close();
              return;
            }
            const data = JSON.stringify({ text: chunk });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();

          if (!signal.aborted) {
            const usage = await result.usage;
            const durationMs = Date.now() - startTime;
            const inTokens = usage?.inputTokens ?? 0;
            const outTokens = usage?.outputTokens ?? 0;
            void trackAiUsage({
              organizationId: orgId,
              step: AiUsageStep.CHAT_COMPLETION,
              provider: 'litellm',
              model: GENERATOR_MODEL,
              inputTokens: inTokens,
              outputTokens: outTokens,
              totalTokens: inTokens + outTokens,
              durationMs,
              metadata: { feature: 'kb-generator' },
            });
          }
        } catch (err) {
          if (signal.aborted) {
            controller.close();
            return;
          }
          logger.error({ err }, 'KB document generation stream error');
          const errorData = JSON.stringify({
            error: 'Generation failed',
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
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
  } catch (err) {
    logger.error({ err }, 'KB document generation failed');
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}
