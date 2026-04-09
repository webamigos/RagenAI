'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@ragenai/tui/button';
import { XMarkIcon, PlusIcon } from '@heroicons/react/24/outline';

type OriginWhitelistProps = {
  value: string[];
  onChange: (value: string[]) => void;
};

export function OriginWhitelist({ value, onChange }: OriginWhitelistProps) {
  const t = useTranslations('settings-page.chatbots.origins');
  const [input, setInput] = useState('');

  const add = () => {
    const trimmed = input.trim();
    if (!trimmed || value.includes(trimmed)) {
      return;
    }
    onChange([...value, trimmed]);
    setInput('');
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

      {value.length === 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
          {t('empty-warning')}
        </p>
      )}

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

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={t('placeholder')}
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-mono text-sm text-zinc-950 placeholder:font-sans placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500 dark:focus:ring-zinc-300"
        />
        <Button outline onClick={add} disabled={!input.trim()}>
          <PlusIcon className="size-4" />
          {t('add')}
        </Button>
      </div>
    </div>
  );
}
