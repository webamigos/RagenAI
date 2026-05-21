'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { ChatbotThemeConfig } from '@/features/chatbots/contracts/chatbot.types';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

type ThemeConfiguratorProps = {
  value: ChatbotThemeConfig;
  onChange: (value: ChatbotThemeConfig) => void;
};

function ColorField({
  id,
  label,
  colorKey,
  value,
  onChange,
}: {
  id: string;
  label: string;
  colorKey: 'primaryColor' | 'bubbleColor';
  value: ChatbotThemeConfig;
  onChange: (value: ChatbotThemeConfig) => void;
}) {
  const t = useTranslations('settings-page.chatbots.theme');
  const resolved = value[colorKey] ?? '#6366f1';
  const [hexInput, setHexInput] = useState(resolved);
  const [hexError, setHexError] = useState(false);

  useEffect(() => {
    setHexInput(resolved);
    setHexError(false);
  }, [resolved]);

  const commitHex = (raw: string) => {
    const hex = raw.startsWith('#') ? raw : `#${raw}`;
    if (HEX_RE.test(hex)) {
      setHexError(false);
      onChange({ ...value, [colorKey]: hex });
    } else {
      setHexError(true);
    }
  };

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs text-zinc-600 dark:text-zinc-400">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={resolved}
          onChange={(e) => {
            setHexInput(e.target.value);
            setHexError(false);
            onChange({ ...value, [colorKey]: e.target.value });
          }}
          className="size-8 cursor-pointer rounded border border-zinc-300 dark:border-zinc-700"
        />
        <div className="relative">
          <input
            type="text"
            value={hexInput}
            maxLength={7}
            onChange={(e) => setHexInput(e.target.value)}
            onBlur={(e) => commitHex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitHex((e.target as HTMLInputElement).value);
              }
            }}
            className={`w-24 rounded border px-2 py-0.5 font-mono text-xs focus:outline-none focus:ring-2 ${
              hexError
                ? 'border-red-400 text-red-600 focus:ring-red-400 dark:border-red-500 dark:text-red-400'
                : 'border-zinc-300 text-zinc-700 focus:ring-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:focus:ring-zinc-300'
            }`}
          />
          {hexError && (
            <span className="absolute left-0 top-full mt-0.5 text-xs text-red-500">
              {t('hex-hint')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ThemeConfigurator({ value, onChange }: ThemeConfiguratorProps) {
  const t = useTranslations('settings-page.chatbots.theme');

  const [questionIds, setQuestionIds] = useState<string[]>(() =>
    (value.starterQuestions ?? []).map(() => crypto.randomUUID()),
  );

  useEffect(() => {
    setQuestionIds((prev) => {
      const len = value.starterQuestions?.length ?? 0;
      if (prev.length === len) {
        return prev;
      }
      if (prev.length < len) {
        return [
          ...prev,
          ...Array.from({ length: len - prev.length }, () =>
            crypto.randomUUID(),
          ),
        ];
      }
      return prev.slice(0, len);
    });
  }, [value.starterQuestions?.length]);

  const update = (key: keyof ChatbotThemeConfig, val: string | string[]) => {
    if (Array.isArray(val)) {
      onChange({ ...value, [key]: val });
      return;
    }
    onChange({ ...value, [key]: val || undefined });
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
        {t('title')}
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {/* Primary color */}
        <ColorField
          id="theme-primary-color"
          label={t('primary-color')}
          colorKey="primaryColor"
          value={value}
          onChange={onChange}
        />

        {/* Bubble color */}
        <ColorField
          id="theme-bubble-color"
          label={t('bubble-color')}
          colorKey="bubbleColor"
          value={value}
          onChange={onChange}
        />

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

      {/* Starter questions */}
      <div className="space-y-2">
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {t('starter-questions')}
        </p>
        {(value.starterQuestions ?? []).map((q, i) => (
          <div key={questionIds[i] ?? i} className="flex items-center gap-2">
            <input
              type="text"
              value={q}
              maxLength={100}
              onChange={(e) => {
                const next = [...(value.starterQuestions ?? [])];
                next[i] = e.target.value;
                update('starterQuestions', next);
              }}
              placeholder={t('starter-questions-placeholder')}
              className="flex-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-zinc-950 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500 dark:focus:ring-zinc-300"
            />
            <button
              type="button"
              aria-label={`${t('starter-questions-remove')} ${i + 1}`}
              onClick={() => {
                setQuestionIds((ids) => ids.filter((_, j) => j !== i));
                const next = (value.starterQuestions ?? []).filter(
                  (_, j) => j !== i,
                );
                update('starterQuestions', next);
              }}
              className="flex size-7 items-center justify-center rounded-md border border-zinc-300 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-300"
            >
              ×
            </button>
          </div>
        ))}
        {(value.starterQuestions ?? []).length < 5 && (
          <button
            type="button"
            onClick={() => {
              setQuestionIds((ids) => [...ids, crypto.randomUUID()]);
              update('starterQuestions', [
                ...(value.starterQuestions ?? []),
                '',
              ]);
            }}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
          >
            + {t('starter-questions-add')}
          </button>
        )}
      </div>
    </div>
  );
}
