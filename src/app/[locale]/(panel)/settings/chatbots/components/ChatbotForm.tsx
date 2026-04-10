'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { Button } from '@ragenai/tui/button';
import type { getChatbotByIdQuery } from '@/features/chatbots/services/queries/get-chatbot-by-id-query';
import type { ChatbotThemeConfig } from '@/features/chatbots/contracts/chatbot.types';
import { logger } from '@/app/lib/utils/logger';
import { updateChatbot } from '../actions';
import { OriginWhitelist } from './OriginWhitelist';
import { ThemeConfigurator } from './ThemeConfigurator';
import { EmbedCodeSection } from './EmbedCodeSection';
import { FileSelector } from './FileSelector';

type Chatbot = NonNullable<Awaited<ReturnType<typeof getChatbotByIdQuery>>>;

type ChatbotFormProps = {
  chatbot: Chatbot;
};

export function ChatbotForm({ chatbot }: ChatbotFormProps) {
  const t = useTranslations('settings-page.chatbots');
  const router = useRouter();

  const [name, setName] = useState(chatbot.name);
  const [allowedOrigins, setAllowedOrigins] = useState<string[]>(
    chatbot.allowedOrigins,
  );
  const [themeConfig, setThemeConfig] = useState<ChatbotThemeConfig>(
    (chatbot.themeConfig as ChatbotThemeConfig) ?? {},
  );
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>(
    chatbot.selectedFileIds,
  );
  const [chatbotPrompt, setChatbotPrompt] = useState(
    chatbot.chatbotPrompt ?? '',
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const mountedRef = useRef(true);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (savedTimeoutRef.current) {
        clearTimeout(savedTimeoutRef.current);
      }
    };
  }, []);

  const handleSave = async () => {
    if (!name.trim()) {
      return;
    }
    setSaving(true);
    setSaveError(false);
    try {
      const result = await updateChatbot(chatbot.id, {
        name: name.trim(),
        allowedOrigins,
        themeConfig,
        selectedFileIds,
        chatbotPrompt: chatbotPrompt.trim() || undefined,
      });
      if (result === null) {
        logger.error({}, 'updateChatbot returned null — chatbot not found');
        if (mountedRef.current) {
          setSaveError(true);
        }
      } else {
        router.refresh();
        if (mountedRef.current) {
          setSaved(true);
          if (savedTimeoutRef.current) {
            clearTimeout(savedTimeoutRef.current);
          }
          savedTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              setSaved(false);
            }
          }, 2000);
        }
      }
    } catch (err) {
      logger.error({ err }, 'Failed to save chatbot');
      if (mountedRef.current) {
        setSaveError(true);
      }
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  };

  return (
    <div className="space-y-4">
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-950 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500 dark:focus:ring-zinc-300"
          />
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
            value={chatbotPrompt}
            onChange={(e) => setChatbotPrompt(e.target.value)}
            rows={5}
            placeholder={t('prompt.placeholder')}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500 dark:focus:ring-zinc-300"
          />
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
      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? t('saving') : t('save')}
        </Button>
        {saved && (
          <span className="text-sm text-green-600 dark:text-green-400">
            {t('saved')}
          </span>
        )}
        {saveError && (
          <span className="text-sm text-red-600 dark:text-red-400">
            {t('save-error')}
          </span>
        )}
      </div>
    </div>
  );
}
