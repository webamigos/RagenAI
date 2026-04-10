import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getChatbotByTokenQuery } from '@/features/chatbots/services/queries/get-chatbot-by-token-query';
import {
  getOrCreateConversationQuery,
  getConversationMessagesQuery,
} from '@/features/chatbots/services/queries/get-conversation-query';
import { appendChatbotMessageCommand } from '@/features/chatbots/services/commands/append-chatbot-message-command';
import { initializeRagChain } from '@/app/api/threads/services/initializeBasicRag';
import { getAllSettings } from '@/features/organizations/services/organization-settings';
import { logger } from '@/app/lib/utils/logger';
import { Role } from '@/generated/prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const chatRequestSchema = z.object({
  message: z.string().min(1).max(10000),
  sessionId: z.string().min(1).max(256),
});

function validateOrigin(
  origin: string | null,
  allowedOrigins: string[],
): boolean {
  if (allowedOrigins.length === 0) {
    return true;
  }
  if (!origin) {
    return false;
  }
  return allowedOrigins.some((allowed) => {
    if (allowed.startsWith('*.')) {
      return origin.endsWith(allowed.slice(1));
    }
    return allowed === origin;
  });
}

function buildCorsHeaders(origin: string | null, allowedOrigins: string[]) {
  const allowOrigin = allowedOrigins.length === 0 ? '*' : (origin ?? '*');

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials':
      allowedOrigins.length > 0 ? 'true' : 'false',
  };
}

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

    const metadataFilter =
      selectedFileIds.length > 0
        ? {
            must: [
              {
                key: 'metadata.organization_id',
                match: { value: organizationId },
              },
              {
                key: 'metadata.file_id',
                match_any: { values: selectedFileIds },
              },
            ],
          }
        : {
            must: [
              {
                key: 'metadata.organization_id',
                match: { value: organizationId },
              },
            ],
          };

    const conversation = await getOrCreateConversationQuery(
      chatbot.id,
      sessionId,
    );

    const previousMessages = await getConversationMessagesQuery(
      conversation.id,
      10,
    );
    const chatHistory = previousMessages
      .reverse()
      .map(
        (m) => `${m.role === Role.USER ? 'Human' : 'Assistant'}: ${m.content}`,
      )
      .join('\n');

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Signal "thinking" immediately so the widget can show the loading indicator
          // before the RAG pipeline (moderation + rephrase + retrieval) completes
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ status: 'thinking' })}\n\n`,
            ),
          );

          const ragChain = await initializeRagChain({
            settings,
            orgId: organizationId,
            // Public widget endpoint — no authenticated user; metadataFilter already
            // restricts access to selectedFileIds so admin bypass is not needed
            isOrgAdmin: false,
            metadataFilter,
            projectInstruction: chatbot.chatbotPrompt,
          });

          const result = await ragChain.stream({
            question: message,
            chat_history: chatHistory,
          });

          let fullResponse = '';

          for await (const part of result.fullStream) {
            if (part.type === 'text-delta') {
              fullResponse += part.textDelta;
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ text: part.textDelta })}\n\n`,
                ),
              );
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();

          try {
            await appendChatbotMessageCommand(
              conversation.id,
              Role.USER,
              message,
            );
            await appendChatbotMessageCommand(
              conversation.id,
              Role.ASSISTANT,
              fullResponse,
            );
          } catch (err) {
            logger.error({ err }, 'Failed to save chatbot messages');
          }
        } catch (err) {
          logger.error({ err }, 'Error in chatbot stream');
          controller.error(err);
        }
      },
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
