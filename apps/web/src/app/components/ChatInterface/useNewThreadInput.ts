import { useCallback, type KeyboardEvent, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNewThread as usePrivateNewThread } from '@/app/hooks/useNewThread';
import { useNewThread as usePublicNewThread } from '@/app/[locale]/public/hooks/useNewThread';
import { ChatResponseType } from '@/features/messages/contracts/message.types';
import { type ThreadDocumentUI } from '@/features/documents/contracts/document.types';
import type { MentionedProject } from './MentionTextarea';
import type { KnowledgeScope } from '@ragenai/platform-contracts';

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
  projectId?: string;
  accessToken?: string;
  preferredModel?: string;
  threadDocuments?: ThreadDocumentUI[];
  onThreadDocumentsChange?: (documents: ThreadDocumentUI[]) => void;
  /** Fixed for the thread's life; only read when the thread is created. */
  knowledgeScope?: KnowledgeScope;
  /** Prefills the composer. The palette's "Ask about …" arrives this way. */
  initialPrompt?: string;
};

export const useNewThreadInput = ({
  organizationId: _organizationId,
  isPublicAccess,
  widgetMode,
  projectId,
  accessToken,
  preferredModel,
  threadDocuments = [],
  onThreadDocumentsChange,
  knowledgeScope,
  initialPrompt,
}: Props) => {
  const t = useTranslations('Index.warning-messages');
  const [mentionedProject, setMentionedProject] =
    useState<MentionedProject | null>(null);
  const {
    handleSubmit: handleFormSubmit,
    formState: { errors },
    watch,
    setValue,
    reset,
  } = useForm<ThreadFormData>({
    resolver: zodResolver(threadSchema(t)),
    defaultValues: {
      // Seeded, not sent. Arriving from the palette with a question in the
      // box leaves the scope, the model and the wording all still editable —
      // choosing to ask is not the same as having asked.
      prompt: initialPrompt ?? '',
    },
  });

  const privateThread = usePrivateNewThread();
  const publicThread = usePublicNewThread({
    accessToken: accessToken!,
    projectId: projectId!,
    organizationId: _organizationId,
    widgetMode: widgetMode || false,
  });

  const threadHandler = isPublicAccess ? publicThread : privateThread;
  const prompt = watch('prompt');

  const handleInputChange = (value: string) => {
    setValue('prompt', value);
  };

  const createVoiceThread = useCallback(async () => {
    if (threadHandler.isLoading || threadHandler.isPending) {
      return;
    }

    sessionStorage.setItem('response_type', ChatResponseType.VOICE);

    // Use mentioned project if available, otherwise use passed project
    const targetProjectId = mentionedProject?.id || projectId;
    const mentionedProjectIdForThread = mentionedProject?.id;
    await threadHandler.handleNewThread(
      undefined,
      targetProjectId,
      targetProjectId,
      mentionedProjectIdForThread,
      preferredModel,
      undefined,
      knowledgeScope,
    );
  }, [
    threadHandler,
    projectId,
    mentionedProject,
    preferredModel,
    knowledgeScope,
  ]);

  const onSubmit = useCallback(
    async (data: ThreadFormData) => {
      if (threadHandler.isLoading || threadHandler.isPending) {
        return;
      }

      // Use mentioned project if available, otherwise use passed project
      const targetProjectId = mentionedProject?.id || projectId;
      const mentionedProjectIdForThread = mentionedProject?.id;
      await threadHandler.handleNewThread(
        data.prompt.trim(),
        targetProjectId,
        targetProjectId,
        mentionedProjectIdForThread,
        preferredModel,
        threadDocuments,
        knowledgeScope,
      );
      reset();
    },
    [
      threadHandler,
      reset,
      projectId,
      mentionedProject,
      preferredModel,
      threadDocuments,
      knowledgeScope,
    ],
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
    setMentionedProjectInHook: setMentionedProject,
    threadDocuments,
    onThreadDocumentsChange,
  };
};
