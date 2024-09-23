import { Client } from 'langsmith';

import { saveRateInDB } from './message';

export const submitFeedbackDirectly = async (
  messageId: string,
  feedback: 'up' | 'down',
  runId: string
) => {
  if (!feedback || (feedback !== 'up' && feedback !== 'down')) {
    throw new Error('Invalid feedback');
  }

  if (!runId) {
    throw new Error('Invalid runId');
  }

  const client = new Client({
    apiKey: process.env.LANGCHAIN_API_KEY,
  });

  await client.createFeedback(runId, 'user-score', {
    score: feedback === 'up' ? 1 : 0,
  });

  await saveRateInDB(messageId, feedback === 'up' ? 1 : 0);

  return { message: 'Feedback submitted' };
};
