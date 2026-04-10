import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getChatbotByTokenQuery } from '@/features/chatbots/services/queries/get-chatbot-by-token-query';
import {
  getOrCreateConversationQuery,
  getConversationMessagesQuery,
  getConversationsBySessionIdsQuery,
} from '@/features/chatbots/services/queries/get-conversation-query';
import { logger } from '@/app/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
    logger.error({ err }, 'Error fetching chatbot in history OPTIONS handler');
  }
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(origin, allowedOrigins),
  });
}

// GET /api/chatbot/[token]/history?sessionId=... — messages for one session
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const origin = req.headers.get('origin');

  const fallbackCorsHeaders = { 'Access-Control-Allow-Origin': origin ?? '*' };

  const sessionId = req.nextUrl.searchParams.get('sessionId');

  if (!sessionId || sessionId.length < 1 || sessionId.length > 256) {
    return NextResponse.json(
      { error: 'sessionId required and must be 1–256 characters' },
      { status: 400, headers: fallbackCorsHeaders },
    );
  }

  let chatbot: Awaited<ReturnType<typeof getChatbotByTokenQuery>>;
  try {
    chatbot = await getChatbotByTokenQuery(token);
  } catch (err) {
    logger.error({ err }, 'Error fetching chatbot by token in history GET');
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: fallbackCorsHeaders },
    );
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

  let messages: Awaited<ReturnType<typeof getConversationMessagesQuery>>;
  try {
    const conversation = await getOrCreateConversationQuery(
      chatbot.id,
      sessionId,
    );
    messages = await getConversationMessagesQuery(conversation.id, 50);
  } catch (err) {
    logger.error({ err }, 'Error fetching conversation messages');
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders },
    );
  }

  return NextResponse.json(
    { messages: messages.slice().reverse() },
    { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } },
  );
}

// POST /api/chatbot/[token]/history — session list with previews
const sessionListSchema = z.object({
  sessionIds: z.array(z.string().min(1).max(256)).min(1).max(100),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const origin = req.headers.get('origin');

  const fallbackCorsHeaders = { 'Access-Control-Allow-Origin': origin ?? '*' };

  let body: unknown;
  try {
    body = await req.json();
  } catch (error) {
    logger.warn(
      { err: error },
      'Chatbot history request contained invalid JSON',
    );
    return NextResponse.json(
      { error: 'Invalid body' },
      { status: 400, headers: fallbackCorsHeaders },
    );
  }

  const parsed = sessionListSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body' },
      { status: 400, headers: fallbackCorsHeaders },
    );
  }

  let chatbot: Awaited<ReturnType<typeof getChatbotByTokenQuery>>;
  try {
    chatbot = await getChatbotByTokenQuery(token);
  } catch (err) {
    logger.error({ err }, 'Error fetching chatbot by token in history POST');
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: fallbackCorsHeaders },
    );
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

  let conversations: Awaited<
    ReturnType<typeof getConversationsBySessionIdsQuery>
  >;
  try {
    conversations = await getConversationsBySessionIdsQuery(
      chatbot.id,
      parsed.data.sessionIds,
    );
  } catch (err) {
    logger.error({ err }, 'Error fetching conversations by session ids');
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders },
    );
  }

  return NextResponse.json(
    { conversations },
    { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } },
  );
}
