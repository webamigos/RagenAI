import { NextRequest, NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';
import { getAuth } from '@clerk/nextjs/server';

import { logger } from '@/app/lib/utils/logger';
import { saveTemperatureSetting } from '@/app/lib/services/settings';

const TemperatureSchema = z.object({
  temperature: z.number().min(0).max(1),
});

export async function PUT(request: NextRequest) {
  const { orgId } = getAuth(request);

  if (!orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { temperature } = TemperatureSchema.parse(body);

    await saveTemperatureSetting(orgId, temperature);

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
