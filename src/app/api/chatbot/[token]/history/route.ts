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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// GET /api/chatbot/[token]/history?sessionId=... — messages for one session
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const sessionId = req.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json(
      { error: 'sessionId required' },
      { status: 400, headers: corsHeaders },
    );
  }

  let chatbot: Awaited<ReturnType<typeof getChatbotByTokenQuery>>;
  try {
    chatbot = await getChatbotByTokenQuery(token);
  } catch (err) {
    logger.error({ err }, 'Error fetching chatbot by token in history GET');
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders },
    );
  }

  if (!chatbot) {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404, headers: corsHeaders },
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
    { messages: messages.reverse() },
    { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } },
  );
}

// POST /api/chatbot/[token]/history — session list with previews
const sessionListSchema = z.object({
  sessionIds: z.array(z.string()).min(1).max(100),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid body' },
      { status: 400, headers: corsHeaders },
    );
  }

  const parsed = sessionListSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body' },
      { status: 400, headers: corsHeaders },
    );
  }

  let chatbot: Awaited<ReturnType<typeof getChatbotByTokenQuery>>;
  try {
    chatbot = await getChatbotByTokenQuery(token);
  } catch (err) {
    logger.error({ err }, 'Error fetching chatbot by token in history POST');
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders },
    );
  }

  if (!chatbot) {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404, headers: corsHeaders },
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
