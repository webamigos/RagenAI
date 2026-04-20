import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@ragenai/prisma-client';
import { AiUsageStep } from '@/generated/prisma/client';
import { initializeRagChain } from '@/app/api/threads/services/initializeBasicRag';
import { getAllSettings } from '@/features/organizations/services/organization-settings';
import { logger } from '@/app/lib/utils/logger';
import { trackAiUsage } from '@/features/ai-usage/services/commands/create-ai-usage-command';
import { getModelProvider, normalizeModelId } from '@/app/components/config';
import {
  InternalAuthError,
  extractInternalContext,
  recordInternalAuthFailure,
  verifyInternalSecret,
} from '@/app/api/v1/utils';
import { loadMcpToolsForApiRequest } from '@/app/api/v1/load-mcp-tools';
import { createApiThread } from '@/app/api/v1/persist-api-thread';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const chatRequestSchema = z.object({
  prompt: z.string().min(1).max(10000),
  context: z.string().max(20000).optional(),
  stream: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  try {
    verifyInternalSecret(request);
    const context = extractInternalContext(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON', code: 400 },
        { status: 400 },
      );
    }
    const {
      prompt,
      context: pageContext,
      stream,
    } = chatRequestSchema.parse(body);

    const project = await db.project.findUnique({
      where: { id: context.projectId },
      select: {
        organizationId: true,
        settings: { select: { instructions: true } },
      },
    });

    if (!project?.organizationId) {
      return NextResponse.json(
        { error: 'Assistant not found', code: 404 },
        { status: 404 },
      );
    }

    const { organizationId, settings: projectSettings } = project;
    const rawSettings = await getAllSettings(organizationId);
    const settings = { ...rawSettings, apiKey: rawSettings.apiKey ?? '' };

    const { mcpTools, mcpContext, closeMcpClients } =
      await loadMcpToolsForApiRequest({
        orgId: organizationId,
        userId: context.userId,
        projectId: context.projectId,
      });

    const ragChain = await initializeRagChain({
      settings,
      orgId: organizationId,
      userId: context.userId,
      projectId: context.projectId,
      projectInstruction: projectSettings?.instructions ?? null,
      mcpTools,
      mcpContext,
    });

    const question = pageContext
      ? `${prompt}\n\nKontekst strony:\n${pageContext}`
      : prompt;

    // Persist thread + user message when debug mode is enabled on the API key
    const debugMode = request.headers.get('x-debug-mode') === '1';
    const apiThread = debugMode
      ? await createApiThread({
          orgId: organizationId,
          userId: context.userId,
          projectId: context.projectId,
          question: prompt,
        })
      : null;
    const threadId = apiThread?.threadId ?? null;
    const saveAssistantMessage = apiThread?.saveAssistantMessage;

    const result = await ragChain.stream({
      question,
      chat_history: '',
    });

    const modelId = settings.model || '';
    const trackUsage = async () => {
      const usage = await Promise.resolve(result.usage).catch(() => undefined);
      if (!usage) {
        return;
      }
      await trackAiUsage({
        organizationId,
        projectId: context.projectId,
        threadId,
        userId: context.userId,
        step: AiUsageStep.CHAT_COMPLETION,
        provider: getModelProvider(normalizeModelId(modelId)) || 'litellm',
        model: modelId,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
        metadata: { source: 'API' },
      });
    };

    if (stream) {
      const encoder = new TextEncoder();
      const sseStream = new ReadableStream({
        async start(controller) {
          try {
            let fullText = '';
            for await (const chunk of result.textStream) {
              fullText += chunk;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`),
              );
            }
            if (saveAssistantMessage) {
              await saveAssistantMessage(fullText);
            }
            await trackUsage();
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (err) {
            controller.error(err);
          } finally {
            await closeMcpClients();
          }
        },
      });

      return new Response(sseStream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Content-Encoding': 'none',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    }

    // Non-streaming: collect full response and return JSON
    let text = '';
    try {
      for await (const chunk of result.textStream) {
        text += chunk;
      }
    } finally {
      await closeMcpClients();
    }
    if (saveAssistantMessage) {
      await saveAssistantMessage(text);
    }
    await trackUsage();

    return NextResponse.json({ text });
  } catch (error) {
    if (error instanceof InternalAuthError) {
      recordInternalAuthFailure(request, '/api/v1/chat', error.message);
      return NextResponse.json(
        { error: 'Unauthorized', code: 401 },
        { status: 401 },
      );
    }

    logger.error({ err: error }, 'Error in /api/v1/chat');

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', code: 400, details: error.issues },
        { status: 400 },
      );
    }

    return new Response('Internal Server Error', { status: 500 });
  }
}
