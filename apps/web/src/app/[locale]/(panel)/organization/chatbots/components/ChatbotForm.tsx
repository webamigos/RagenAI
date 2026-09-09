'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { TrashIcon } from '@heroicons/react/24/outline';
import { Button } from '@ragenai/common-ui/Button';
import { statusToast } from '@/app/lib/utils/toast';
import { logger } from '@/app/lib/utils/logger';
import type { getChatbotByIdQuery } from '@/features/chatbots/services/queries/get-chatbot-by-id-query';
import type { ChatbotThemeConfig } from '@/features/chatbots/contracts/chatbot.types';
import { updateChatbot, deleteChatbot } from '../actions';
import { OriginWhitelist } from './OriginWhitelist';
import { ThemeConfigurator } from './ThemeConfigurator';
import { EmbedCodeSection } from './EmbedCodeSection';
import { FileSelector } from './FileSelector';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const schema = getChatbotFormSchema(t);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ChatbotFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: chatbot.name,
      chatbotPrompt: chatbot.chatbotPrompt ?? '',
    },
  });

  const isExternalDirty =
    JSON.stringify(allowedOrigins) !== JSON.stringify(chatbot.allowedOrigins) ||
    JSON.stringify(themeConfig) !== JSON.stringify(chatbot.themeConfig ?? {}) ||
    JSON.stringify(selectedFileIds) !== JSON.stringify(chatbot.selectedFileIds);

  const isFormDirty = isDirty || isExternalDirty;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteChatbot(chatbot.id);
      router.push('/organization/chatbots');
    } catch (err) {
      logger.error({ err }, 'Failed to delete chatbot');
      errorToast({ message: t('delete-error') });
    } finally {
      setIsDeleting(false);
    }
  };

  const onSubmit = async (data: ChatbotFormData) => {
    try {
      const result = await updateChatbot(chatbot.id, {
        name: data.name,
        chatbotPrompt: data.chatbotPrompt?.trim() || null,
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
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Name */}
        <section className="rounded-xl border border-border bg-white p-6 dark:bg-card">
          <div className="space-y-1.5">
            <label
              htmlFor="chatbot-name"
              className="text-sm font-medium text-foreground dark:text-white"
            >
              {t('name-label')}
            </label>
            <input
              id="chatbot-name"
              type="text"
              {...register('name')}
              className="w-full rounded-md border border-border bg-white px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring dark:bg-muted dark:text-white"
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>
        </section>

        {/* System prompt */}
        <section className="rounded-xl border border-border bg-white p-6 dark:bg-card">
          <div className="space-y-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-medium text-foreground dark:text-white">
                {t('prompt.title')}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t('prompt.description')}
              </p>
            </div>
            <textarea
              id="chatbot-system-prompt"
              {...register('chatbotPrompt')}
              rows={5}
              placeholder={t('prompt.placeholder')}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring dark:bg-muted dark:text-white"
            />
            {errors.chatbotPrompt && (
              <p className="text-xs text-destructive">
                {errors.chatbotPrompt.message}
              </p>
            )}
          </div>
        </section>

        {/* Theme */}
        <section className="rounded-xl border border-border bg-white p-6 dark:bg-card">
          <ThemeConfigurator
            value={themeConfig}
            onChange={setThemeConfig}
            chatbotId={chatbot.id}
          />
        </section>

        {/* Knowledge base */}
        <section className="rounded-xl border border-border bg-white p-6 dark:bg-card">
          <FileSelector value={selectedFileIds} onChange={setSelectedFileIds} />
        </section>

        {/* Allowed origins */}
        <section className="rounded-xl border border-border bg-white p-6 dark:bg-card">
          <OriginWhitelist
            value={allowedOrigins}
            onChange={setAllowedOrigins}
          />
        </section>

        {/* Embed code */}
        <section className="rounded-xl border border-border bg-white p-6 dark:bg-card">
          <EmbedCodeSection widgetToken={chatbot.widgetToken} />
        </section>

        {/* Danger zone */}
        <section className="rounded-xl border border-destructive/40 bg-white p-6 dark:bg-card">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-foreground dark:text-white">
                {t('delete-title')}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t('delete-confirm', { name: chatbot.name })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsDeleteOpen(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-crimson-50 dark:hover:bg-crimson-950/30 cursor-pointer"
            >
              <TrashIcon className="size-4" />
              {t('delete')}
            </button>
          </div>
        </section>

        {/* Save */}
        <div className="pt-2">
          <Button type="submit" disabled={isSubmitting || !isFormDirty}>
            {isSubmitting ? t('saving') : t('save')}
          </Button>
        </div>
      </form>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete-title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete-confirm', { name: chatbot.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} className="cursor-pointer">
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="cursor-pointer bg-destructive hover:bg-destructive/90 focus:ring-destructive"
            >
              {isDeleting ? t('deleting') : t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
