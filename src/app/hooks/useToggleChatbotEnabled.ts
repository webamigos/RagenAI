import { useState } from 'react';
import { toggleChatbotEnabled } from '@/app/lib/services/project';

export const useToggleChatbotEnabled = (projectId: number) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleToggleChatbotEnabled = async (enabled: boolean) => {
    setIsUpdating(true);
    setError(null);

    try {
      const { success } = await toggleChatbotEnabled(projectId, enabled);
      setIsUpdating(false);
      return success;
    } catch (err) {
      setError(
        err instanceof Error
          ? err
          : new Error('Failed to toggle chatbot status')
      );
      setIsUpdating(false);
      return false;
    }
  };

  return {
    toggleChatbotEnabled: handleToggleChatbotEnabled,
    isUpdating,
    error,
  };
};
