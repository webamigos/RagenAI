'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ThreadMemoryChanges } from '@/features/memory/contracts/memory.types';
import { getThreadMemoryChangesAction } from './actions';

/**
 * When to read again after a fresh answer. The extraction runs in the worker
 * after the turn is saved, so the latest answer's line appears seconds later;
 * reading stops as soon as it does, and after the last delay whether or not
 * it did — most turns change nothing.
 */
export const MEMORY_LINE_POLL_DELAYS_MS = [0, 4_000, 12_000, 30_000];

/** How recent an answer must be for its line to be worth waiting for. */
export const MEMORY_LINE_FRESH_MS = 2 * 60_000;

/**
 * The thread's memory changes, keyed by assistant message. Read once per
 * thread; read again, a few times, when the latest answer is fresh enough
 * that its extraction may still be running. Disabled (no thread) reads
 * nothing.
 */
export function useThreadMemoryChanges(
  threadId: string | undefined,
  latestAnswer: { id: string; createdAt?: Date | string | null } | undefined,
): { changes: ThreadMemoryChanges; refresh: () => Promise<void> } {
  const latestId = latestAnswer?.id;
  const latestAt = latestAnswer?.createdAt
    ? new Date(latestAnswer.createdAt).getTime()
    : undefined;
  const [changes, setChanges] = useState<ThreadMemoryChanges>({});

  // The thread on screen now. A refresh started on one thread — after an
  // undo, say — that resolves once the reader has moved to another must not
  // write the old thread's changes over the new one's.
  const currentThread = useRef(threadId);
  useEffect(() => {
    currentThread.current = threadId;
  }, [threadId]);

  const refresh = useCallback(async () => {
    if (!threadId) {
      return;
    }
    const next = await getThreadMemoryChangesAction(threadId);
    if (currentThread.current === threadId) {
      setChanges(next);
    }
  }, [threadId]);

  useEffect(() => {
    if (!threadId) {
      setChanges({});
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A message streamed in this session may not carry a timestamp yet; it
    // is fresh by definition.
    const pollFor =
      latestId &&
      (latestAt === undefined || Date.now() - latestAt < MEMORY_LINE_FRESH_MS)
        ? latestId
        : undefined;
    const delays = pollFor ? MEMORY_LINE_POLL_DELAYS_MS : [0];
    const read = (attempt: number) => {
      timer = setTimeout(async () => {
        const next = await getThreadMemoryChangesAction(threadId);
        if (cancelled) {
          return;
        }
        setChanges(next);
        if (pollFor && !next[pollFor] && attempt + 1 < delays.length) {
          read(attempt + 1);
        }
      }, delays[attempt]);
    };
    read(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [threadId, latestId, latestAt]);

  return { changes, refresh };
}
