import { NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

import db from '@salesyy/prisma-client';
import { logger } from '@/app/lib/utils/logger';

const TemperatureSchema = z.object({
  temperature: z.number().min(0).max(1),
});

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { temperature } = TemperatureSchema.parse(body);

    await db.settings.upsert({
      where: { key: 'temperature' },
      update: {
        value: temperature.toString(),
      },
      create: {
        key: 'temperature',
        value: temperature.toString(),
      },
    });

    return NextResponse.json(
      { message: 'Temperature updated' },
      { status: StatusCodes.OK }
    );
  } catch (error) {
    logger.error('Failed to update temperature:', error);
    return NextResponse.json(
      { error: 'Failed to update temperature' },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }
}
