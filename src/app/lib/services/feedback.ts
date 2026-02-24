import { saveRateInDB } from './message';

export const submitFeedbackDirectly = async (
  messageId: string,
  feedback: 'up' | 'down'
) => {
  if (!feedback || (feedback !== 'up' && feedback !== 'down')) {
    throw new Error('Invalid feedback');
  }

  await saveRateInDB(messageId, feedback === 'up' ? 1 : 0);

  return { message: 'Feedback submitted' };
};
