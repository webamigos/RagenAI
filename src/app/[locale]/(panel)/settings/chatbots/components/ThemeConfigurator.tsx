'use client';

import { useTranslations } from 'next-intl';
import type { ChatbotThemeConfig } from '@/features/chatbots/contracts/chatbot.types';

type ThemeConfiguratorProps = {
  value: ChatbotThemeConfig;
  onChange: (value: ChatbotThemeConfig) => void;
};

export function ThemeConfigurator({ value, onChange }: ThemeConfiguratorProps) {
  const t = useTranslations('settings-page.chatbots.theme');

  const update = (key: keyof ChatbotThemeConfig, val: string) => {
    onChange({ ...value, [key]: val || undefined });
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
        {t('title')}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {/* Primary color */}
        <div className="space-y-1.5">
          <label
            htmlFor="theme-primary-color"
            className="text-xs text-zinc-600 dark:text-zinc-400"
          >
            {t('primary-color')}
          </label>
          <div className="flex items-center gap-2">
            <input
              id="theme-primary-color"
              type="color"
              value={value.primaryColor ?? '#6366f1'}
              onChange={(e) => update('primaryColor', e.target.value)}
              className="size-8 cursor-pointer rounded border border-zinc-300 dark:border-zinc-700"
            />
            <span className="text-xs text-zinc-500">
              {value.primaryColor ?? '#6366f1'}
            </span>
          </div>
        </div>

        {/* Bubble color */}
        <div className="space-y-1.5">
          <label
            htmlFor="theme-bubble-color"
            className="text-xs text-zinc-600 dark:text-zinc-400"
          >
            {t('bubble-color')}
          </label>
          <div className="flex items-center gap-2">
            <input
              id="theme-bubble-color"
              type="color"
              value={value.bubbleColor ?? '#6366f1'}
              onChange={(e) => update('bubbleColor', e.target.value)}
              className="size-8 cursor-pointer rounded border border-zinc-300 dark:border-zinc-700"
            />
            <span className="text-xs text-zinc-500">
              {value.bubbleColor ?? '#6366f1'}
            </span>
          </div>
        </div>

        {/* Position */}
        <div className="space-y-1.5">
          <label
            htmlFor="theme-position"
            className="text-xs text-zinc-600 dark:text-zinc-400"
          >
            {t('position')}
          </label>
          <select
            id="theme-position"
            value={value.position ?? 'right'}
            onChange={(e) => update('position', e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:ring-zinc-300"
          >
            <option value="right">{t('position-right')}</option>
            <option value="left">{t('position-left')}</option>
          </select>
        </div>

        {/* Bot name */}
        <div className="space-y-1.5">
          <label
            htmlFor="theme-bot-name"
            className="text-xs text-zinc-600 dark:text-zinc-400"
          >
            {t('bot-name')}
          </label>
          <input
            id="theme-bot-name"
            type="text"
            value={value.botName ?? ''}
            onChange={(e) => update('botName', e.target.value)}
            placeholder={t('bot-name-placeholder')}
            className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-950 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500 dark:focus:ring-zinc-300"
          />
        </div>
      </div>

      {/* Welcome message */}
      <div className="space-y-1.5">
        <label
          htmlFor="theme-welcome-message"
          className="text-xs text-zinc-600 dark:text-zinc-400"
        >
          {t('welcome-message')}
        </label>
        <input
          id="theme-welcome-message"
          type="text"
          value={value.welcomeMessage ?? ''}
          onChange={(e) => update('welcomeMessage', e.target.value)}
          placeholder={t('welcome-message-placeholder')}
          className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-950 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500 dark:focus:ring-zinc-300"
        />
      </div>
    </div>
  );
}
