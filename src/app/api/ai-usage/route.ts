import { type NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { AiUsageStep } from '@/generated/prisma/client';
import { createAiUsageCommand } from '@/features/ai-usage/services/commands/create-ai-usage-command';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ai-usage
 *
 * Internal endpoint for the worker (ragen-worker) to report embedding usage.
 * Secured via WORKER_SECRET_KEY header (timing-safe comparison).
 */
export async function POST(request: NextRequest) {
  try {
    const secretKey = request.headers.get('x-worker-secret');
    const expectedKey = process.env.WORKER_SECRET_KEY;

    if (!expectedKey || !secretKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const secretBuf = Buffer.from(secretKey);
    const expectedBuf = Buffer.from(expectedKey);
    if (
      secretBuf.length !== expectedBuf.length ||
      !timingSafeEqual(secretBuf, expectedBuf)
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const {
      organizationId,
      projectId,
      userId,
      step,
      provider,
      model,
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCost,
      durationMs,
      metadata,
    } = body;

    if (!organizationId || !step || !provider || !model) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: organizationId, step, provider, model',
        },
        { status: 400 },
      );
    }

    const validSteps = Object.values(AiUsageStep);
    if (!validSteps.includes(step)) {
      return NextResponse.json(
        { error: `Invalid step. Must be one of: ${validSteps.join(', ')}` },
        { status: 400 },
      );
    }

    await createAiUsageCommand({
      organizationId,
      projectId: projectId ?? null,
      userId: userId ?? null,
      step: step as AiUsageStep,
      provider,
      model,
      inputTokens: inputTokens ?? 0,
      outputTokens: outputTokens ?? 0,
      totalTokens: totalTokens ?? 0,
      estimatedCost: estimatedCost ?? null,
      durationMs: durationMs ?? null,
      metadata: metadata ?? null,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, 'Error in AI usage reporting endpoint');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
