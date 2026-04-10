'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { Button } from '@ragenai/tui/button';
import { statusToast } from '@/app/lib/utils/toast';
import { logger } from '@/app/lib/utils/logger';
import type { getChatbotByIdQuery } from '@/features/chatbots/services/queries/get-chatbot-by-id-query';
import type { ChatbotThemeConfig } from '@/features/chatbots/contracts/chatbot.types';
import { updateChatbot } from '../actions';
import { OriginWhitelist } from './OriginWhitelist';
import { ThemeConfigurator } from './ThemeConfigurator';
import { EmbedCodeSection } from './EmbedCodeSection';
import { FileSelector } from './FileSelector';

type Chatbot = NonNullable<Awaited<ReturnType<typeof getChatbotByIdQuery>>>;

type ChatbotFormProps = {
  chatbot: Chatbot;
};

const getChatbotFormSchema = (t: (key: string) => string) =>
  z.object({
    name: z.string().min(1, t('name-required')).max(100, t('name-max')),
    chatbotPrompt: z.string().max(5000, t('prompt-max')).optional(),
  });

type ChatbotFormData = z.infer<ReturnType<typeof getChatbotFormSchema>>;

export function ChatbotForm({ chatbot }: ChatbotFormProps) {
  const t = useTranslations('settings-page.chatbots');
  const router = useRouter();
  const { successToast, errorToast } = statusToast();

  const [allowedOrigins, setAllowedOrigins] = useState<string[]>(
    chatbot.allowedOrigins,
  );
  const [themeConfig, setThemeConfig] = useState<ChatbotThemeConfig>(
    (chatbot.themeConfig as ChatbotThemeConfig) ?? {},
  );
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>(
    chatbot.selectedFileIds,
  );

  const schema = getChatbotFormSchema(t);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChatbotFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: chatbot.name,
      chatbotPrompt: chatbot.chatbotPrompt ?? '',
    },
  });

  const onSubmit = async (data: ChatbotFormData) => {
    try {
      const result = await updateChatbot(chatbot.id, {
        name: data.name,
        chatbotPrompt: data.chatbotPrompt?.trim() || undefined,
        allowedOrigins,
        themeConfig,
        selectedFileIds,
      });
      if (result === null) {
        logger.error({}, 'updateChatbot returned null — chatbot not found');
        errorToast({ message: t('save-error') });
      } else {
        router.refresh();
        successToast({ message: t('saved') });
      }
    } catch (err) {
      logger.error({ err }, 'Failed to save chatbot');
      errorToast({ message: t('save-error') });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Name */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="space-y-1.5">
          <label
            htmlFor="chatbot-name"
            className="text-sm font-medium text-zinc-950 dark:text-white"
          >
            {t('name-label')}
          </label>
          <input
            id="chatbot-name"
            type="text"
            {...register('name')}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-950 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500 dark:focus:ring-zinc-300"
          />
          {errors.name && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {errors.name.message}
            </p>
          )}
        </div>
      </section>

      {/* System prompt */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="space-y-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
              {t('prompt.title')}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {t('prompt.description')}
            </p>
          </div>
          <textarea
            id="chatbot-system-prompt"
            {...register('chatbotPrompt')}
            rows={5}
            placeholder={t('prompt.placeholder')}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500 dark:focus:ring-zinc-300"
          />
          {errors.chatbotPrompt && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {errors.chatbotPrompt.message}
            </p>
          )}
        </div>
      </section>

      {/* Theme */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <ThemeConfigurator value={themeConfig} onChange={setThemeConfig} />
      </section>

      {/* Knowledge base */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <FileSelector value={selectedFileIds} onChange={setSelectedFileIds} />
      </section>

      {/* Allowed origins */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <OriginWhitelist value={allowedOrigins} onChange={setAllowedOrigins} />
      </section>

      {/* Embed code */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <EmbedCodeSection widgetToken={chatbot.widgetToken} />
      </section>

      {/* Save */}
      <div className="pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  );
}
