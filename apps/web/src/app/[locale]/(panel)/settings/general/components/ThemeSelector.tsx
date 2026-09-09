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
            className="h-20 rounded-lg border border-border animate-pulse bg-muted"
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
                ? 'border-border bg-muted text-foreground dark:border-white dark:text-white'
                : 'border-border text-muted-foreground hover:border-border/90 hover:text-foreground',
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
