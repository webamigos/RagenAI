'use client';

import { useState } from 'react';
import { toggleChatbotCommand as toggleChatbotEnabled } from '@/features/projects/services/commands/toggle-chatbot-command';

export const useToggleChatbotEnabled = (projectId: string) => {
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
          : new Error('Failed to toggle chatbot status'),
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
