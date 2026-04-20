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
import { checkApiRequestLimit } from '@/app/api/v1/check-api-limit';
import { loadMcpToolsForApiRequest } from '@/app/api/v1/load-mcp-tools';
import { createApiThread } from '@/app/api/v1/persist-api-thread';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Internal endpoint consumed by ragen-api's OpenAI-compatible
 * `/v1/chat/completions` controller. Accepts a richer shape than the
 * legacy `/api/v1/chat` route:
 *
 *   - `messages` array (flattened to question + chat_history)
 *   - `model` / `temperature` per-request overrides
 *   - `max_tokens` threaded into `streamText({ maxOutputTokens })`
 *
 * Response shapes are ragen-internal (not OpenAI): ragen-api is
 * responsible for translating to/from the OpenAI wire format.
 *   - Non-streaming: `{ text, model, usage }`
 *   - Streaming: SSE with `data: {"text":"..."}` per chunk,
 *     final `data: {"usage":{...},"model":"..."}`, `data: [DONE]`.
 */
const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(100),
  model: z.string().min(1).max(200).optional(),
  temperature: z.number().min(0).max(2).optional(),
  // snake_case to match the OpenAI-compat wire format ragen-api speaks.
  max_tokens: z.number().int().positive().max(32_000).optional(),
  stream: z.boolean().optional().default(false),
});

type ParsedRequest = z.infer<typeof requestSchema>;

/**
 * Fold an OpenAI-style messages array into what the RAG chain expects.
 *
 * - The last `user` message becomes `question`.
 * - `user`/`assistant` turns before it become `chat_history`, using the
 *   `"USER: ..."`/`"ASSISTANT: ..."` format that `formatChatHistory()`
 *   in `basic-rag/operations.ts` parses. The prefix casing matters —
 *   anything else is silently dropped by the parser.
 * - `system` messages are pulled out into `systemPrompts` so the caller
 *   can merge them into the chain's `projectInstruction` (the chain
 *   parser has no `SYSTEM:` branch, so they can't ride the history).
 * - If no user message is present we fall back to the last message as
 *   the prompt — Zod's `min(1)` guarantees at least one message.
 */
function foldMessages(messages: ParsedRequest['messages']): {
  question: string;
  chatHistory: string;
  systemPrompts: string[];
} {
  const systemPrompts = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content);

  const conversation = messages.filter((m) => m.role !== 'system');

  if (conversation.length === 0) {
    return {
      question: messages[messages.length - 1].content,
      chatHistory: '',
      systemPrompts,
    };
  }

  let lastUserIdx = -1;
  for (let i = conversation.length - 1; i >= 0; i -= 1) {
    if (conversation[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }

  if (lastUserIdx === -1) {
    return {
      question: conversation[conversation.length - 1].content,
      chatHistory: '',
      systemPrompts,
    };
  }

  const question = conversation[lastUserIdx].content;
  const history = conversation
    .slice(0, lastUserIdx)
    .map((m) => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content}`)
    .join('\n');

  return { question, chatHistory: history, systemPrompts };
}

/**
 * Merge caller-supplied `system` messages with the project's existing
 * instructions. Order: project instruction first (the owner's intent),
 * then the caller's system messages appended as per-request overrides.
 */
function mergeProjectInstruction(
  projectInstruction: string | null | undefined,
  systemPrompts: string[],
): string | null {
  const parts: string[] = [];
  if (projectInstruction?.trim()) {
    parts.push(projectInstruction);
  }
  for (const p of systemPrompts) {
    if (p.trim()) {
      parts.push(p);
    }
  }
  if (parts.length === 0) {
    return null;
  }
  return parts.join('\n\n');
}

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

    const parsed = requestSchema.parse(body);

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

    const apiLimit = await checkApiRequestLimit(organizationId);
    if (apiLimit.exceeded) {
      return NextResponse.json(
        {
          error: 'Monthly API request limit exceeded',
          code: 429,
          limit: apiLimit.limit,
          current: apiLimit.current,
        },
        { status: 429 },
      );
    }

    const rawSettings = await getAllSettings(organizationId);

    // Apply per-request overrides on top of the org defaults. Undefined
    // overrides leave the org value untouched.
    const settings = {
      ...rawSettings,
      apiKey: rawSettings.apiKey ?? '',
      ...(parsed.model !== undefined ? { model: parsed.model } : {}),
      ...(parsed.temperature !== undefined
        ? { temperature: parsed.temperature }
        : {}),
    };

    const effectiveModel = settings.model;

    const { question, chatHistory, systemPrompts } = foldMessages(
      parsed.messages,
    );

    const { mcpTools, mcpContext, closeMcpClients } =
      await loadMcpToolsForApiRequest({
        orgId: organizationId,
        userId: context.userId,
        projectId: context.projectId,
      });

    try {
      const ragChain = await initializeRagChain({
        settings,
        orgId: organizationId,
        userId: context.userId,
        projectId: context.projectId,
        projectInstruction: mergeProjectInstruction(
          projectSettings?.instructions ?? null,
          systemPrompts,
        ),
        maxTokens: parsed.max_tokens,
        mcpTools,
        mcpContext,
      });

      // Persist thread + user message when debug mode is enabled on the API key
      const debugMode = request.headers.get('x-debug-mode') === '1';
      const apiThread = debugMode
        ? await createApiThread({
            orgId: organizationId,
            userId: context.userId,
            projectId: context.projectId,
            question,
            chatHistory,
          })
        : null;
      const threadId = apiThread?.threadId ?? null;
      const saveAssistantMessage = apiThread?.saveAssistantMessage;

      const result = await ragChain.stream({
        question,
        chat_history: chatHistory,
      });

      if (parsed.stream) {
        const encoder = new TextEncoder();
        const sseStream = new ReadableStream({
          async start(controller) {
            try {
              let fullText = '';
              for await (const chunk of result.textStream) {
                fullText += chunk;
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ text: chunk })}\n\n`,
                  ),
                );
              }
              if (saveAssistantMessage) {
                await saveAssistantMessage(fullText);
              }
              // Resolve usage after the stream completes. The Vercel AI
              // SDK promises only settle once the underlying provider
              // flushes its final chunk.
              const usage = await Promise.resolve(result.usage).catch(
                () => undefined,
              );
              if (usage) {
                await trackAiUsage({
                  organizationId,
                  projectId: context.projectId,
                  threadId,
                  userId: context.userId,
                  step: AiUsageStep.CHAT_COMPLETION,
                  provider:
                    getModelProvider(normalizeModelId(effectiveModel)) ||
                    'litellm',
                  model: effectiveModel,
                  inputTokens: usage.inputTokens ?? 0,
                  outputTokens: usage.outputTokens ?? 0,
                  totalTokens: usage.totalTokens ?? 0,
                  metadata: { source: 'API' },
                });
              }
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    model: effectiveModel,
                    usage: usage
                      ? {
                          prompt_tokens: usage.inputTokens ?? 0,
                          completion_tokens: usage.outputTokens ?? 0,
                          total_tokens: usage.totalTokens ?? 0,
                        }
                      : undefined,
                  })}\n\n`,
                ),
              );
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

      // Non-streaming: collect full response + usage.
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
      const usage = await Promise.resolve(result.usage).catch(() => undefined);

      if (usage) {
        await trackAiUsage({
          organizationId,
          projectId: context.projectId,
          threadId,
          userId: context.userId,
          step: AiUsageStep.CHAT_COMPLETION,
          provider:
            getModelProvider(normalizeModelId(effectiveModel)) || 'litellm',
          model: effectiveModel,
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          totalTokens: usage.totalTokens ?? 0,
          metadata: { source: 'API' },
        });
      }

      return NextResponse.json({
        text,
        model: effectiveModel,
        usage: usage
          ? {
              prompt_tokens: usage.inputTokens ?? 0,
              completion_tokens: usage.outputTokens ?? 0,
              total_tokens: usage.totalTokens ?? 0,
            }
          : undefined,
      });
    } catch (mcpError) {
      // Clean up MCP clients on early failures (initializeRagChain,
      // createApiThread) before the stream starts its own cleanup.
      await closeMcpClients();
      throw mcpError;
    }
  } catch (error) {
    if (error instanceof InternalAuthError) {
      recordInternalAuthFailure(
        request,
        '/api/v1/chat/completions',
        error.message,
      );
      return NextResponse.json(
        { error: 'Unauthorized', code: 401 },
        { status: 401 },
      );
    }

    logger.error({ err: error }, 'Error in /api/v1/chat/completions');

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', code: 400, details: error.issues },
        { status: 400 },
      );
    }

    return new Response('Internal Server Error', { status: 500 });
  }
}
