import { NextResponse } from 'next/server';

import db from '@salesyy/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export async function GET() {
  try {
    const setting = await db.setting.findUnique({
      where: { key: 'temperature' },
    });

    const temperature = setting ? parseFloat(setting.value) : 0.7;

    return NextResponse.json({ temperature });
  } catch (error) {
    logger.error('Failed to fetch settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}
