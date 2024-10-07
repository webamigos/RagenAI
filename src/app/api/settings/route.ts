import { NextRequest, NextResponse } from 'next/server';
import db from '@salesyy/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export async function GET(_request: NextRequest) {
  try {
    const settings = await db.setting.findMany({
      where: {
        key: { in: ['temperature', 'chat_model', 'assistant_prompt'] },
      },
    });

    const temperatureSetting = settings.find((s) => s.key === 'temperature');
    const modelSetting = settings.find((s) => s.key === 'chat_model');
    const promptSetting = settings.find((s) => s.key === 'assistant_prompt');

    const temperature = temperatureSetting
      ? parseFloat(temperatureSetting.value)
      : 0.7;
    const model = modelSetting ? modelSetting.value : 'gpt-3.5-turbo';
    const prompt = promptSetting ? promptSetting.value : 'Default prompt';

    return NextResponse.json({ temperature, model, prompt });
  } catch (error) {
    logger.error('Failed to fetch settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}
