import { NextResponse } from 'next/server';

import db from '@salesyy/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export async function GET() {
  try {
    const settings = await db.setting.findMany({
      where: {
        key: { in: ['temperature', 'chat_model'] },
      },
    });

    const temperatureSetting = settings.find((s) => s.key === 'temperature');
    const modelSetting = settings.find((s) => s.key === 'chat_model');

    const temperature = temperatureSetting
      ? parseFloat(temperatureSetting.value)
      : 0.7;
    const model = modelSetting ? modelSetting.value : 'gpt-3.5-turbo';

    return NextResponse.json({ temperature, model });
  } catch (error) {
    logger.error('Failed to fetch settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}
