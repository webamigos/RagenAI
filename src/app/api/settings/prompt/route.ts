import { NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

import db from '@salesyy/prisma-client';

const promptSchema = z.object({
  prompt: z.string().min(50, 'Prompt is required'),
});

export async function PUT(request: Request) {
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

    const updatedPrompt = await db.settings.upsert({
      where: { key: 'assistant_prompt' },
      update: { value: prompt },
      create: { key: 'assistant_prompt', value: prompt },
    });

    return NextResponse.json({
      status: StatusCodes.OK,
      message: 'Prompt updated successfully',
      updatedPrompt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error updating prompt' },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }
}
