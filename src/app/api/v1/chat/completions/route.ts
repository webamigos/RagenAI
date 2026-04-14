import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import db from '@ragenai/prisma-client';
import { initializeRagChain } from '@/app/api/threads/services/initializeBasicRag';
import { getAllSettings } from '@/features/organizations/services/organization-settings';
import { logger } from '@/app/lib/utils/logger';
import {
  InternalAuthError,
  extractInternalContext,
  recordInternalAuthFailure,
  verifyInternalSecret,
} from '@/app/api/v1/utils';

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
 * Fold an OpenAI-style messages array into the `(question, chat_history)`
 * pair the RAG chain expects.
 *
 * - The last `user` message becomes the question.
 * - All messages _before_ that last user message are stringified into
 *   `chat_history`. System messages are emitted as `System:` lines
 *   (they'll act as extra instructions layered on top of the org prompt).
 * - If no user message is present the request is rejected upstream;
 *   here we defensively fall back to the last message content.
 */
function foldMessages(messages: ParsedRequest['messages']): {
  question: string;
  chatHistory: string;
} {
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }

  if (lastUserIdx === -1) {
    // Degenerate case — no user turn. Use the last message as the prompt
    // so the chain has something to work with; the upstream SDK validator
    // should normally prevent this.
    return {
      question: messages[messages.length - 1].content,
      chatHistory: '',
    };
  }

  const question = messages[lastUserIdx].content;
  const roleLabel: Record<ParsedRequest['messages'][number]['role'], string> = {
    user: 'User',
    assistant: 'Assistant',
    system: 'System',
  };
  const history = messages
    .slice(0, lastUserIdx)
    .map((m) => `${roleLabel[m.role]}: ${m.content}`)
    .join('\n');

  return { question, chatHistory: history };
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

    const ragChain = await initializeRagChain({
      settings,
      orgId: organizationId,
      projectId: context.projectId,
      projectInstruction: projectSettings?.instructions ?? null,
      maxTokens: parsed.max_tokens,
    });

    const { question, chatHistory } = foldMessages(parsed.messages);

    const result = await ragChain.stream({
      question,
      chat_history: chatHistory,
    });

    if (parsed.stream) {
      const encoder = new TextEncoder();
      const sseStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of result.textStream) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`),
              );
            }
            // Resolve usage after the stream completes. The Vercel AI
            // SDK promises only settle once the underlying provider
            // flushes its final chunk.
            const usage = await result.usage.catch(() => undefined);
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
    for await (const chunk of result.textStream) {
      text += chunk;
    }
    const usage = await result.usage.catch(() => undefined);

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
