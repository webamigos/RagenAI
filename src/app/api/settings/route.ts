import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';

import { logger } from '@/app/lib/utils/logger';
import {
  getAssistantPrompt,
  getModel,
  getOpenaiAPIKey,
  getTemperatureSetting,
} from '@/app/lib/services/settings';

export async function GET(request: NextRequest) {
  const { orgId, userId } = getAuth(request);

  if (!orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const apiKey = await getOpenaiAPIKey(orgId);
    const temperature = await getTemperatureSetting(orgId);
    const model = await getModel(orgId);
    const prompt = await getAssistantPrompt(orgId);

    if (!apiKey) {
      return NextResponse.json(
        { message: 'No API Key found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ apiKey, temperature, model, prompt });
  } catch (error) {
    logger.error('Failed to fetch settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}
