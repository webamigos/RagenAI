import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/app/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const errorBodySchema = z.object({
  message: z.string().max(1000).optional(),
  url: z.string().max(2000).optional(),
  userAgent: z.string().max(500).optional(),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  let body: z.infer<typeof errorBodySchema> = {};
  try {
    const raw = await req.json();
    const parsed = errorBodySchema.safeParse(raw);
    if (parsed.success) {
      body = parsed.data;
    }
  } catch {
    // malformed body — log what we have
  }

  logger.error(
    {
      chatbotToken: token,
      message: body.message ?? '(no message)',
      url: body.url ?? '(no url)',
      userAgent: body.userAgent ?? '(no userAgent)',
    },
    'chatbot-widget error',
  );

  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
