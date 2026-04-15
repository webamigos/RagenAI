import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getChatbotByTokenQuery } from '@/features/chatbots/services/queries/get-chatbot-by-token-query';
import {
  getChatbotSessionMessagesQuery,
  getChatbotSessionListQuery,
} from '@/features/chatbots/services/queries/get-chatbot-session-messages-query';
import { logger } from '@/app/lib/utils/logger';
import { validateOrigin, buildCorsHeaders } from '../cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sessionIdSchema = z.string().min(1).max(256);
const sessionListSchema = z.object({
  sessionIds: z.array(z.string().min(1).max(256)).min(1).max(100),
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

  const sessionIdParsed = sessionIdSchema.safeParse(
    req.nextUrl.searchParams.get('sessionId'),
  );
  if (!sessionIdParsed.success) {
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

  let messages: { role: string; content: string }[];
  try {
    messages = await getChatbotSessionMessagesQuery(
      chatbot.id,
      sessionIdParsed.data,
    );
  } catch (err) {
    logger.error({ err }, 'Error fetching chatbot session messages');
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: corsHeaders },
    );
  }

  return NextResponse.json(
    { messages },
    { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } },
  );
}

// POST /api/chatbot/[token]/history — session list with previews
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

  let conversations: Awaited<ReturnType<typeof getChatbotSessionListQuery>>;
  try {
    conversations = await getChatbotSessionListQuery(
      chatbot.id,
      parsed.data.sessionIds,
    );
  } catch (err) {
    logger.error({ err }, 'Error fetching chatbot session list');
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
