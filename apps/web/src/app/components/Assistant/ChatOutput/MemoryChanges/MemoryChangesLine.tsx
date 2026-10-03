'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/routing';
import type { MemoryChangeView } from '@/features/memory/contracts/memory.types';
import {
  undoMemoryChangeAction,
  type UndoMemoryChangeActionResult,
} from './actions';

const OPERATION_KEY = {
  ADD: 'remembered',
  UPDATE: 'updated',
  DELETE: 'forgot',
} as const;

type Notice = 'full' | 'failed';

/** What to tell the reader after an undo, if anything beyond the new state. */
function noticeFor(outcome: UndoMemoryChangeActionResult): Notice | undefined {
  if (!outcome.success) {
    return 'failed';
  }
  return outcome.result === 'full' ? 'full' : undefined;
}

/**
 * "Remembered: prefers bullet points · Undo" under an answer that changed the
 * user's memory (spec 2026-09-27-personal-memory-across-threads, D2). One row
 * per change. Each row's state is said in words, never by colour alone: an
 * undo button, "Undone", or — when the memory was written since — a link to
 * the settings page, where the current statement can be edited instead.
 */
export function MemoryChangesLine({
  changes,
  onChanged,
}: {
  changes: readonly MemoryChangeView[];
  /** Read the thread's changes again, after an undo landed or was refused. */
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('assistant.memory-line');
  const [pending, setPending] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, Notice>>({});

  if (changes.length === 0) {
    return null;
  }

  const undo = async (publicId: string) => {
    setPending(publicId);
    try {
      const notice = noticeFor(await undoMemoryChangeAction(publicId));
      setNotices(({ [publicId]: _previous, ...rest }) =>
        notice ? { ...rest, [publicId]: notice } : rest,
      );
      await onChanged();
    } finally {
      setPending(null);
    }
  };

  return (
    <ul
      aria-label={t('label')}
      className="mt-2 space-y-1 text-xs text-muted-foreground"
    >
      {changes.map((change) => (
        <li
          key={change.publicId}
          className="flex flex-wrap items-baseline gap-x-1"
        >
          <span className="break-words">
            {t(OPERATION_KEY[change.operation], { content: change.content })}
          </span>
          <span aria-hidden="true">·</span>
          {change.state === 'undoable' && (
            <button
              type="button"
              onClick={() => void undo(change.publicId)}
              disabled={pending !== null}
              className="font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-50"
            >
              {pending === change.publicId ? t('undoing') : t('undo')}
            </button>
          )}
          {change.state === 'undone' && <span>{t('undone')}</span>}
          {change.state === 'stale' && (
            <Link
              href="/settings/memory"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {t('stale')}
            </Link>
          )}
          {notices[change.publicId] ? (
            <span role="status" className="basis-full">
              {t(notices[change.publicId])}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
