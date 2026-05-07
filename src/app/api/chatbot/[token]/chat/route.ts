import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { streamText, stepCountIs } from 'ai';
import { observe, updateActiveTrace } from '@langfuse/tracing';
import { getChatbotByTokenQuery } from '@/features/chatbots/services/queries/get-chatbot-by-token-query';
import { getOrCreateChatbotThreadCommand } from '@/features/chatbots/services/commands/get-or-create-chatbot-thread-command';
import { createMessageInDbCommand } from '@/features/messages/services/commands/create-message-command';
import { initializeRagChain } from '@/app/api/threads/services/initializeBasicRag';
import { getAllSettings } from '@/features/organizations/services/organization-settings';
import { logger } from '@/app/lib/utils/logger';
import { AiUsageStep, Role, Source } from '@/generated/prisma/client';
import { trackAiUsage } from '@/features/ai-usage/services/commands/create-ai-usage-command';
import { isEncryptionEnabled } from '@/libs/crypto/thread-encryption';
import { normalizeModelId, getModelProvider } from '@/app/components/config';
import { validateOrigin, buildCorsHeaders } from '../cors';
import { getChatbotThreadHistoryQuery } from '@/features/chatbots/services/queries/get-chatbot-thread-history-query';
import { buildChatbotMetadataFilter } from './metadata-filter';
import { getAtriumTools } from './atrium-tools';
import { checkChatbotRateLimit } from './rate-limit';
import { isBudgetExceededError } from './budget-error';
import {
  classifyJailbreakRisk,
  isAboveJailbreakThreshold,
} from '@/libs/security/jailbreak-classifier';
import { recordSecurityEvent } from '@/features/security/services/commands/record-security-event-command';
import { ChatCompletionFactory } from '@/libs/llm/chat-completion-factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const chatRequestSchema = z.object({
  message: z.string().min(1).max(10000),
  sessionId: z.string().min(1).max(256),
});

export async function OPTIONS(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const origin = req.headers.get('origin');
  let allowedOrigins: string[] = [];
  try {
    const chatbot = await getChatbotByTokenQuery(token);
    allowedOrigins = chatbot?.allowedOrigins ?? [];
  } catch (err) {
    logger.error({ err }, 'Error fetching chatbot in OPTIONS handler');
  }
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(origin, allowedOrigins),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const origin = request.headers.get('origin');

  const fallbackCorsHeaders = { 'Access-Control-Allow-Origin': origin ?? '*' };

  let chatbot: Awaited<ReturnType<typeof getChatbotByTokenQuery>>;
  try {
    chatbot = await getChatbotByTokenQuery(token);
  } catch (err) {
    logger.error({ err }, 'Error fetching chatbot by token');
    return new Response('Internal Server Error', {
      status: 500,
      headers: fallbackCorsHeaders,
    });
  }

  if (!chatbot) {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404, headers: fallbackCorsHeaders },
    );
  }

  const corsHeaders = buildCorsHeaders(origin, chatbot.allowedOrigins);

  if (!validateOrigin(origin, chatbot.allowedOrigins)) {
    return NextResponse.json(
      { error: 'Origin not allowed' },
      { status: 403, headers: corsHeaders },
    );
  }

  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const rateLimit = await checkChatbotRateLimit(token, clientIp);
  if (!rateLimit.ok) {
    // Fire-and-forget — admins see repeated limit hits in the
    // security dashboard so they can tell a misconfigured widget
    // from a real abuse attempt. The Phase 0.5 escalation rule
    // bumps severity if hits cluster.
    recordSecurityEvent({
      eventType: 'RATE_LIMIT_HIT',
      severity: 'info',
      source: 'chatbot',
      organizationId: chatbot.organizationId,
      ipAddress: clientIp,
      userAgent: request.headers.get('user-agent') ?? null,
      metadata: {
        scope: rateLimit.scope,
        chatbotId: chatbot.id,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
    });
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          ...corsHeaders,
          'Retry-After': String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    logger.warn({ err: error }, 'Chatbot chat request contained invalid JSON');
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400, headers: corsHeaders },
    );
  }

  let parsed: z.infer<typeof chatRequestSchema>;
  try {
    parsed = chatRequestSchema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400, headers: corsHeaders },
      );
    }
    throw error;
  }

  const { message, sessionId } = parsed;
  const { organizationId, selectedFileIds } = chatbot;

  try {
    const rawSettings = await getAllSettings(organizationId);
    const settings = { ...rawSettings, apiKey: rawSettings.apiKey ?? '' };

    const metadataFilter = buildChatbotMetadataFilter(
      organizationId,
      selectedFileIds,
    );

    const thread = await getOrCreateChatbotThreadCommand(
      chatbot.id,
      organizationId,
      sessionId,
    );

    const previousMessages = await getChatbotThreadHistoryQuery(thread.id, 10);

    const chatHistory = previousMessages
      .map(
        (m) => `${m.role === Role.USER ? 'Human' : 'Assistant'}: ${m.content}`,
      )
      .join('\n');

    // When there is existing conversation history the chatbot is mid-flow
    // (e.g. a step-by-step configurator). Routing through the RAG rephrase
    // pipeline causes short replies like "wewnątrz" or "A" to lose context
    // and trigger irrelevant document retrieval. For turns with history we
    // call the LLM directly with the full chat history + system prompt so
    // the model can follow the conversation flow without RAG interference.
    // RAG is still used for the very first turn (no history) so KB documents
    // are retrieved and injected into context when the user first asks.
    const hasHistory = previousMessages.length > 0;

    const encoder = new TextEncoder();

    const trackedModelId = settings.model || '';
    const trackedProvider = getModelProvider(normalizeModelId(trackedModelId));
    const skipLangfuseContent = isEncryptionEnabled();

    // Save the USER message up-front so any early-return path (budget
    // exceeded, RAG crash, stream abort) still persists what the visitor
    // asked. Failures are logged, never fatal — the conversation view
    // tolerates a missing turn better than a silently-lost one.
    const saveUserMessage = async () => {
      try {
        await createMessageInDbCommand({
          threadId: thread.id,
          message: { content: message },
          role: Role.USER,
          visitorId: sessionId,
        });
      } catch (err) {
        logger.error({ err }, 'Failed to save chatbot USER message');
      }
    };

    const stream = new ReadableStream({
      start: observe(async function chatbotStream(controller) {
        // Set Langfuse trace context. Session groups all messages in a
        // conversation; omit input/output when per-message encryption
        // is on so Langfuse only sees metadata (tags, model, timings).
        updateActiveTrace({
          name: 'chat-chatbot',
          ...(skipLangfuseContent ? {} : { input: message }),
          sessionId: `${organizationId}:${thread.id}`,
          tags: [
            `provider:${trackedProvider}`,
            `model:${trackedModelId}`,
            'surface:chatbot',
            `chatbot:${chatbot.id}`,
          ],
        });

        // Persist USER turn before the stream so budget-exceeded and
        // other early-return branches don't drop it from history.
        await saveUserMessage();

        // Fire-and-forget jailbreak classification. Public chatbots are
        // the most exposed jailbreak surface — we want the score on
        // every turn for the security dashboard and escalation rules.
        // Short-circuits to score=0 when JAILBREAK_DETECTION_ENABLED is
        // off. Must not delay or block the user's stream.
        void classifyJailbreakRisk(message)
          .then((classification) => {
            if (classification.skipped) {
              return;
            }
            // `classification.reason` is LLM-derived text that may
            // quote or paraphrase the user's message — never emit it
            // to Langfuse when at-rest encryption is on, otherwise
            // the content would leak through the observability layer.
            // SecurityEvent metadata is an internal org-admin audit
            // surface so the reason still lands there.
            updateActiveTrace({
              metadata: {
                jailbreakScore: classification.score,
                ...(classification.reason && !skipLangfuseContent
                  ? { jailbreakReason: classification.reason }
                  : {}),
              },
            });
            if (isAboveJailbreakThreshold(classification.score)) {
              recordSecurityEvent({
                eventType: 'CHAT_JAILBREAK_DETECTED',
                severity: 'info',
                source: 'chatbot',
                organizationId,
                ipAddress: clientIp,
                userAgent: request.headers.get('user-agent') ?? null,
                metadata: {
                  score: classification.score,
                  chatbotId: chatbot.id,
                  threadId: thread.id,
                  messageLength: message.length,
                  ...(classification.reason
                    ? { reason: classification.reason }
                    : {}),
                },
              });
            }
          })
          .catch((err) => {
            logger.debug(
              { err },
              'Jailbreak classifier post-processing failed (chatbot)',
            );
          });

        try {
          // Signal "thinking" immediately so the widget can show the
          // loading indicator before RAG (moderation + rephrase +
          // retrieval) completes.
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ status: 'thinking' })}\n\n`,
            ),
          );

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let result: Awaited<ReturnType<typeof streamText<any>>>;

          if (hasHistory) {
            // Mid-conversation: call LLM directly with full history,
            // bypassing RAG rephrase+retrieval which loses step context.
            const model = ChatCompletionFactory.createInstance(
              {
                provider: 'litellm',
                baseUrl:
                  process.env.LITELLM_PROXY_URL || 'http://localhost:4000',
                apiKey: process.env.LITELLM_MASTER_KEY || 'sk-litellm-dev-key',
              },
              { model: settings.model || 'gemini-2.5-flash' },
            );

            const historyMessages = previousMessages.map((m) => ({
              role:
                m.role === Role.USER
                  ? ('user' as const)
                  : ('assistant' as const),
              content: m.content,
            }));

            result = streamText({
              model,
              system: chatbot.chatbotPrompt ?? undefined,
              messages: [
                ...historyMessages,
                { role: 'user' as const, content: message },
              ],
              tools: getAtriumTools(),
              stopWhen: stepCountIs(5),
            });
          } else {
            // First turn: use RAG so KB documents are retrieved and
            // injected into context (e.g. product list for step 3).
            const ragChain = await initializeRagChain({
              settings,
              orgId: organizationId,
              isOrgAdmin: false,
              metadataFilter,
              projectInstruction: chatbot.chatbotPrompt,
            });

            const ragResult = await ragChain.stream({
              question: message,
              chat_history: chatHistory,
            });

            let fullResponse = '';
            for await (const part of ragResult.fullStream) {
              if (part.type === 'text-delta') {
                fullResponse += part.textDelta;
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ text: part.textDelta })}\n\n`,
                  ),
                );
              }
            }

            try {
              const usage = await ragResult.usage;
              await trackAiUsage({
                organizationId,
                projectId: null,
                threadId: thread.id,
                userId: null,
                step: AiUsageStep.CHAT_COMPLETION,
                provider: trackedProvider,
                model: trackedModelId,
                inputTokens: usage.inputTokens ?? 0,
                outputTokens: usage.outputTokens ?? 0,
                totalTokens: usage.totalTokens ?? 0,
              });
            } catch (usageError) {
              logger.error(
                { err: usageError },
                'Failed to read chatbot stream usage (RAG)',
              );
            }

            if (!skipLangfuseContent) {
              updateActiveTrace({ output: fullResponse });
            }

            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();

            if (fullResponse.trim().length > 0) {
              try {
                await createMessageInDbCommand({
                  threadId: thread.id,
                  message: { content: fullResponse, source: Source.CHATBOT },
                  role: Role.ASSISTANT,
                });
              } catch (err) {
                logger.error(
                  { err },
                  'Failed to save chatbot ASSISTANT message (RAG)',
                );
              }
            }
            return;
          }

          let fullResponse = '';

          for await (const part of result.fullStream) {
            if (part.type === 'text-delta') {
              fullResponse += part.text;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ text: part.text })}\n\n`,
                ),
              );
            }
          }

          try {
            const usage = await result.usage;
            await trackAiUsage({
              organizationId,
              projectId: null,
              threadId: thread.id,
              userId: null,
              step: AiUsageStep.CHAT_COMPLETION,
              provider: trackedProvider,
              model: trackedModelId,
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
              totalTokens: usage.totalTokens ?? 0,
            });
          } catch (usageError) {
            logger.error(
              { err: usageError },
              'Failed to read chatbot stream usage',
            );
          }

          if (!skipLangfuseContent) {
            updateActiveTrace({ output: fullResponse });
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();

          // USER message was persisted at the top of the handler;
          // here we only save the ASSISTANT turn. Skip it entirely
          // when the model produced no text (moderation refusal,
          // silent budget error, tool-only turn) — an empty row
          // pollutes the conversation view without signal.
          if (fullResponse.trim().length > 0) {
            try {
              await createMessageInDbCommand({
                threadId: thread.id,
                message: { content: fullResponse, source: Source.CHATBOT },
                role: Role.ASSISTANT,
              });
            } catch (err) {
              logger.error({ err }, 'Failed to save chatbot ASSISTANT message');
            }
          } else {
            logger.info(
              { chatbotId: chatbot.id, threadId: thread.id },
              'Skipping empty chatbot assistant message',
            );
          }
        } catch (err) {
          // LiteLLM returns "Budget has been exceeded" when the org's
          // virtual key hits its monthly cap. Surface as a structured
          // SSE event so the widget can render a friendly message
          // instead of erroring out with a blank bubble.
          if (isBudgetExceededError(err)) {
            logger.warn(
              { err, orgId: organizationId, chatbotId: chatbot.id },
              'LiteLLM budget exceeded for chatbot',
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  error: 'budget_exceeded',
                  message:
                    "This chatbot's organization has reached its monthly usage limit. Please try again later.",
                })}\n\n`,
              ),
            );
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            return;
          }
          logger.error({ err }, 'Error in chatbot stream');
          controller.error(err);
        }
      }),
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Content-Encoding': 'none',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error in chatbot /chat endpoint');
    return new Response('Internal Server Error', {
      status: 500,
      headers: corsHeaders,
    });
  }
}
