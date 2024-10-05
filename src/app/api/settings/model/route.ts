import { NextResponse } from 'next/server';
import db from '@salesyy/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { z } from 'zod';

const ModelSchema = z.object({
  model: z.string(),
});

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { model } = ModelSchema.parse(body);

    await db.setting.upsert({
      where: { key: 'chat_model' },
      update: {
        value: model,
      },
      create: {
        key: 'chat_model',
        value: model,
      },
    });

    return NextResponse.json({ message: 'Model updated' });
  } catch (error) {
    logger.error('Failed to update model:', error);
    return NextResponse.json(
      { error: 'Failed to update model' },
      { status: 500 }
    );
  }
}
