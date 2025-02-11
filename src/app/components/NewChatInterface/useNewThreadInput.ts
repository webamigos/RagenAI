import { useState, useCallback, KeyboardEvent } from 'react';

import { useNewThread } from '@/app/hooks/useNewThread';

export const useNewThreadInput = () => {
  const [prompt, setPrompt] = useState('');
  const { handleNewThread, isLoading, isPending, isLimitLock } = useNewThread();

  const handleInputChange = (value: string) => {
    setPrompt(value);
  };

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || isLoading || isPending || isLimitLock) return;

    await handleNewThread(prompt.trim());
    setPrompt('');
  }, [prompt, handleNewThread, isLoading, isPending, isLimitLock]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return {
    prompt,
    isLoading,
    isPending,
    isLimitLock,
    handleInputChange,
    handleSubmit,
    handleKeyDown,
  };
};
