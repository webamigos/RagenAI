'use client';

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
    // Note: In client-side code we use console.error since logger might not be available
    // eslint-disable-next-line no-console
    console.error('Error updating thread model:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
