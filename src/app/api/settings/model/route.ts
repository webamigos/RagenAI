import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { z } from 'zod';

import { logger } from '@/app/lib/utils/logger';
import { saveModel } from '@/app/lib/services/settings';

const ModelSchema = z.object({
  model: z.string(),
});

export async function PUT(request: NextRequest) {
  const { orgId } = getAuth(request);

  if (!orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { model } = ModelSchema.parse(body);

    await saveModel(orgId, model);

    return NextResponse.json({ message: 'Model updated' });
  } catch (error) {
    logger.error('Failed to update model:', error);
    return NextResponse.json(
      { error: 'Failed to update model' },
      { status: 500 }
    );
  }
}
