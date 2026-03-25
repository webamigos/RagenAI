import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ai-usage
 *
 * Deprecated: AI usage is now tracked automatically by LiteLLM via org-specific virtual keys.
 * This endpoint is kept to avoid breaking the worker during deployment transition.
 * The worker should be updated to stop calling this endpoint.
 */
export async function POST() {
  return NextResponse.json(
    {
      success: true,
      message:
        'AI usage tracking is now handled by LiteLLM. This endpoint is deprecated.',
    },
    { status: 200 },
  );
}
