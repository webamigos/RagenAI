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
    <div className="space-y-6">
      {/* Name */}
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
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-950 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500 dark:focus:ring-zinc-300"
        />
      </div>

      {/* Theme */}
      <ThemeConfigurator value={themeConfig} onChange={setThemeConfig} />

      {/* Allowed origins */}
      <OriginWhitelist value={allowedOrigins} onChange={setAllowedOrigins} />

      {/* Embed code */}
      <EmbedCodeSection widgetToken={chatbot.widgetToken} />

      {/* Save */}
      <div className="flex items-center gap-3">
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
