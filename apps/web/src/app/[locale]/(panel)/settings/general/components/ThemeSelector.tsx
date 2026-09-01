'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline';
import { classMerge } from '@ragenai/common-ui/utils/cn';

const themes = [
  { value: 'light', icon: SunIcon, labelKey: 'theme-light' },
  { value: 'dark', icon: MoonIcon, labelKey: 'theme-dark' },
  { value: 'system', icon: ComputerDesktopIcon, labelKey: 'theme-system' },
] as const;

export function ThemeSelector() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  const t = useTranslations('settings-page.general');

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="grid grid-cols-3 gap-3">
        {themes.map((opt) => (
          <div
            key={opt.value}
            className="h-20 rounded-lg border border-zinc-200 dark:border-zinc-700 animate-pulse bg-zinc-100 dark:bg-zinc-800"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {themes.map((opt) => {
        const Icon = opt.icon;
        const isActive = theme === opt.value;

        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            className={classMerge(
              'flex flex-col items-center justify-center gap-2 rounded-lg border px-4 py-4 text-sm transition-colors',
              isActive
                ? 'border-zinc-950 bg-zinc-100 text-zinc-950 dark:border-white dark:bg-zinc-800 dark:text-white'
                : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-300',
            )}
          >
            <Icon className="size-5" />
            <span>{t(opt.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
