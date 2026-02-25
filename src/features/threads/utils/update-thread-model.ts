'use client';

import { logger } from '@/app/lib/utils/logger';

export async function updateThreadModel(
  threadId: string,
  model: string | null
) {
  try {
    const response = await fetch(`/api/threads/${threadId}/model`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to update thread model');
    }

    return data;
  } catch (error) {
    logger.error({ error }, 'Error updating thread model');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
