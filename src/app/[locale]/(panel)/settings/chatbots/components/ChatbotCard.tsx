'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { statusToast } from '@/app/lib/utils/toast';
import { logger } from '@/app/lib/utils/logger';
import { Button } from '@ragenai/tui/button';
import { Badge } from '@ragenai/tui/badge';
import {
  ChatBubbleLeftRightIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
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
import { deleteChatbot } from '../actions';
import type { getChatbotsQuery } from '@/features/chatbots/services/queries/get-chatbots-query';

type Chatbot = Awaited<ReturnType<typeof getChatbotsQuery>>[number];

type ChatbotCardProps = {
  chatbot: Chatbot;
};

export function ChatbotCard({ chatbot }: ChatbotCardProps) {
  const t = useTranslations('settings-page.chatbots');
  const router = useRouter();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { errorToast } = statusToast();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteChatbot(chatbot.id);
      router.refresh();
      setIsDeleteOpen(false);
    } catch (err) {
      logger.error({ err }, 'Failed to delete chatbot');
      errorToast({ message: t('delete-error') });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="flex items-start gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
          <ChatBubbleLeftRightIcon className="size-5 text-zinc-600 dark:text-zinc-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
              {chatbot.name}
            </h3>
            <Badge color={chatbot.isActive ? 'green' : 'zinc'}>
              {chatbot.isActive ? t('active') : t('inactive')}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
            {t('files-count', { count: chatbot.selectedFileIds.length })}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            outline
            onClick={() => router.push(`/settings/chatbots/${chatbot.id}`)}
          >
            <PencilIcon className="size-4" />
            {t('edit')}
          </Button>
          <Button outline onClick={() => setIsDeleteOpen(true)}>
            <TrashIcon className="size-4" />
          </Button>
        </div>
      </div>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete-title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete-confirm', { name: chatbot.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? t('deleting') : t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
