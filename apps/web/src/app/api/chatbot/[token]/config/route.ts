import { type NextRequest, NextResponse } from 'next/server';
import { getChatbotByTokenQuery } from '@/features/chatbots/services/queries/get-chatbot-by-token-query';
import { type ChatbotPublicConfig } from '@/features/chatbots/contracts/chatbot.types';
import { logger } from '@/app/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  let chatbot: Awaited<ReturnType<typeof getChatbotByTokenQuery>>;
  try {
    chatbot = await getChatbotByTokenQuery(token);
  } catch (err) {
    logger.error({ err }, 'Error fetching chatbot config by token');
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

  const config: ChatbotPublicConfig = {
    name: chatbot.name,
    themeConfig:
      (chatbot.themeConfig as ChatbotPublicConfig['themeConfig']) ?? {},
  };

  return NextResponse.json(config, {
    headers: {
      ...corsHeaders,
      'Cache-Control': 'public, max-age=60',
    },
  });
}
