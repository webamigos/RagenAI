import { useCallback, KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNewThread as usePrivateNewThread } from '@/app/hooks/useNewThread';
import { useNewThread as usePublicNewThread } from '@/app/[locale]/public/hooks/useNewThread';
import { ChatResponseType } from '@/app/contracts/Message';

const threadSchema = (t: (key: string) => string) =>
  z.object({
    prompt: z
      .string()
      .min(10, t('prompt-min-length'))
      .max(10000, t('prompt-max-length')),
  });

type ThreadFormData = z.infer<ReturnType<typeof threadSchema>>;

type Props = {
  organizationId?: string;
  isPublicAccess?: boolean;
  widgetMode?: boolean;
  projectId?: number;
  projectPublicId?: string;
  accessToken?: string;
};

export const useNewThreadInput = ({
  organizationId,
  isPublicAccess,
  widgetMode,
  projectId,
  projectPublicId,
  accessToken,
}: Props) => {
  const t = useTranslations('Index.warning-messages');
  const {
    handleSubmit: handleFormSubmit,
    formState: { errors },
    watch,
    setValue,
    reset,
  } = useForm<ThreadFormData>({
    resolver: zodResolver(threadSchema(t)),
    defaultValues: {
      prompt: '',
    },
  });

  const privateThread = usePrivateNewThread();
  const publicThread = usePublicNewThread({
    accessToken: accessToken!,
    projectId: projectId!,
    widgetMode: widgetMode || false,
  });

  const threadHandler = isPublicAccess ? publicThread : privateThread;
  const prompt = watch('prompt');

  const handleInputChange = (value: string) => {
    setValue('prompt', value);
  };

  const createVoiceThread = useCallback(async () => {
    if (threadHandler.isLoading || threadHandler.isPending) return;

    sessionStorage.setItem('response_type', ChatResponseType.VOICE);
    await threadHandler.handleNewThread(undefined, projectId, projectPublicId);
  }, [threadHandler, projectId, projectPublicId, prompt]);

  const onSubmit = useCallback(
    async (data: ThreadFormData) => {
      if (threadHandler.isLoading || threadHandler.isPending) return;

      await threadHandler.handleNewThread(
        data.prompt.trim(),
        projectId,
        projectPublicId
      );
      reset();
    },
    [threadHandler, reset, projectId, projectPublicId]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleFormSubmit(onSubmit)();
    }
  };

  return {
    prompt,
    isLoading: threadHandler.isLoading,
    isPending: threadHandler.isPending,
    handleInputChange,
    handleSubmit: handleFormSubmit(onSubmit),
    handleKeyDown,
    createVoiceThread,
    errors,
  };
};
