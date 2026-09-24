'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
} from '@heroicons/react/24/outline';

const STORAGE_KEY = 'ragen.preview.expanded';

/** Panel width classes for the two states, shared by every preview drawer. */
export const PREVIEW_WIDTH = {
  normal: 'w-[90vw]',
  expanded: 'w-screen',
} as const;

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Whether the preview drawer spans the whole window. Remembered per browser,
 * because someone who widens a spreadsheet once will want it wide next time.
 */
export function usePreviewExpanded() {
  const [expanded, setExpanded] = useState<boolean>(() =>
    typeof window === 'undefined' ? false : readStored(),
  );

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Storage blocked: the toggle still works for this session.
      }
      return next;
    });
  }, []);

  return { expanded, toggle };
}

type Props = {
  expanded: boolean;
  onToggle: () => void;
};

export function PreviewWidthToggle({ expanded, onToggle }: Props) {
  const t = useTranslations('document-preview');
  const Icon = expanded ? ArrowsPointingInIcon : ArrowsPointingOutIcon;
  const label = expanded ? t('collapse-width') : t('expand-width');

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={expanded}
      title={label}
      className="hidden rounded p-1.5 text-muted-foreground hover:bg-muted sm:inline-flex dark:hover:bg-paper-700"
    >
      <Icon className="size-4" />
    </button>
  );
}
