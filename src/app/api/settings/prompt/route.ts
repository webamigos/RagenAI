import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { saveAssistantPrompt } from '@/app/lib/services/settings';

const promptSchema = z.object({
  prompt: z.string().min(50, 'Prompt is required'),
});

export async function PUT(request: NextRequest) {
  const { orgId } = getAuth(request);

  if (!orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    const validationResult = promptSchema.safeParse(body);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((err) => err.message);
      return NextResponse.json(
        { error: 'Validation failed', details: errors },
        { status: StatusCodes.BAD_REQUEST }
      );
    }

    const { prompt } = validationResult.data;

    await saveAssistantPrompt(orgId, prompt);

    return NextResponse.json({
      status: StatusCodes.OK,
      message: 'Prompt updated successfully',
      prompt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error updating prompt' },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }
}
