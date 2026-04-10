'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@ragenai/tui/button';
import { XMarkIcon, PlusIcon } from '@heroicons/react/24/outline';
import { logger } from '@/app/lib/utils/logger';

type OriginWhitelistProps = {
  value: string[];
  onChange: (value: string[]) => void;
};

function normalizeOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {return null;}

  // Dodaj https:// jeśli brak protokołu
  const withProtocol =
    trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    // Origin = protokół + host + opcjonalny port (bez trailing slash, bez ścieżki)
    return url.origin;
  } catch (error) {
    logger.warn({ err: error, raw }, 'Failed to parse origin URL');
    return null;
  }
}

export function OriginWhitelist({ value, onChange }: OriginWhitelistProps) {
  const t = useTranslations('settings-page.chatbots.origins');
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);

  const add = () => {
    const normalized = normalizeOrigin(input);
    if (!normalized) {
      setError(true);
      return;
    }
    if (value.includes(normalized)) {
      setInput('');
      setError(false);
      return;
    }
    onChange([...value, normalized]);
    setInput('');
    setError(false);
  };

  const remove = (origin: string) => {
    onChange(value.filter((o) => o !== origin));
  };

  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
          {t('title')}
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {t('description')}
        </p>
      </div>

      <div className="space-y-1.5">
        {value.map((origin) => (
          <div
            key={origin}
            className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-1.5 dark:border-zinc-800"
          >
            <span className="flex-1 font-mono text-sm text-zinc-950 dark:text-white">
              {origin}
            </span>
            <button
              onClick={() => remove(origin)}
              className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400"
            >
              <XMarkIcon className="size-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder={t('placeholder')}
            className={`w-full rounded-md border px-3 py-1.5 font-mono text-sm text-zinc-950 placeholder:font-sans placeholder:text-zinc-400 focus:outline-none focus:ring-2 dark:text-white dark:placeholder:text-zinc-500 ${
              error
                ? 'border-red-400 focus:ring-red-400 dark:border-red-500'
                : 'border-zinc-300 focus:ring-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:ring-zinc-300'
            }`}
          />
          {error && (
            <span className="absolute left-0 top-full mt-0.5 text-xs text-red-500">
              {t('invalid-url')}
            </span>
          )}
        </div>
        <Button outline onClick={add} disabled={!input.trim()}>
          <PlusIcon className="size-4" />
          {t('add')}
        </Button>
      </div>

      {value.length === 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
          {t('empty-warning')}
        </p>
      )}
    </div>
  );
}
