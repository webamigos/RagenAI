// @deprecated — Use rateMessageCommand from @/features/messages instead
import { rateMessageCommand } from '@/features/messages/services/commands/rate-message-command';

/** @deprecated Use rateMessageCommand from @/features/messages instead */
export const submitFeedbackDirectly = async (
  messageId: string,
  feedback: 'up' | 'down'
) => {
  if (!feedback || (feedback !== 'up' && feedback !== 'down')) {
    throw new Error('Invalid feedback');
  }

  const result = await rateMessageCommand(messageId, feedback);

  if (!result.success) {
    throw new Error(result.error || 'Failed to submit feedback');
  }

  return { message: 'Feedback submitted' };
};
