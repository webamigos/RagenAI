import { useState, useCallback, KeyboardEvent } from 'react';
import { useNewThread as usePrivateNewThread } from '@/app/hooks/useNewThread';
import { useNewThread as usePublicNewThread } from '@/app/[locale]/public/hooks/useNewThread';

type Props = {
  organizationId?: string;
  isPublicAccess?: boolean;
  widgetMode?: boolean;
};

export const useNewThreadInput = ({
  organizationId,
  isPublicAccess,
  widgetMode,
}: Props) => {
  const [prompt, setPrompt] = useState('');
  const privateThread = usePrivateNewThread();
  const publicThread = usePublicNewThread({
    organizationId: organizationId || '',
    widgetMode: widgetMode || false,
  });

  const threadHandler = isPublicAccess ? publicThread : privateThread;

  const handleInputChange = (value: string) => {
    setPrompt(value);
  };

  const handleSubmit = useCallback(async () => {
    if (!prompt.trim() || threadHandler.isLoading || threadHandler.isPending)
      return;

    await threadHandler.handleNewThread(prompt.trim());
    setPrompt('');
  }, [prompt, threadHandler]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return {
    prompt,
    isLoading: threadHandler.isLoading,
    isPending: threadHandler.isPending,
    handleInputChange,
    handleSubmit,
    handleKeyDown,
  };
};
