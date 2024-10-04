import db from '@salesyy/prisma-client';

export async function getTemperatureSetting(): Promise<number> {
  const setting = await db.setting.findUnique({
    where: { key: 'temperature' },
  });

  return setting ? parseFloat(setting.value) : 0.7;
}
