'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

import type { RootState } from '@/store';
import type { MessageRetrieval } from '@/store/assistant/assistantSlice';
import type { MessageDto } from '@/features/messages/contracts/message.types';

const RAIL_OPEN_KEY = 'ragen:sources-rail-open';

/**
 * Whether the rail is open, kept across reloads.
 *
 * `localStorage`, which is per browser rather than per account — the brief
 * says "remembered per user" and this is as close as the panel gets without a
 * user-preferences table. The distinction is worth stating: signing in on
 * another machine starts from the default. `ragen:files-view-mode` next door
 * makes the same trade for the same reason.
 *
 * Open is the default, and the first render is the default too. Reading
 * storage during render would make the server and the client disagree about
 * the very first paint; the stored value is applied in an effect instead, so
 * a closed rail flashes rather than hydrating wrong.
 */
function readStoredOpen(): boolean {
  try {
    return localStorage.getItem(RAIL_OPEN_KEY) !== 'closed';
  } catch {
    // Private mode, or storage disabled. A preference nobody can save is not
    // a reason to hide the panel.
    return true;
  }
}

export function useSourcesRailOpen(): {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
} {
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    setIsOpen(readStoredOpen());
  }, []);

  const setOpen = useCallback((open: boolean) => {
    setIsOpen(open);
    try {
      localStorage.setItem(RAIL_OPEN_KEY, open ? 'open' : 'closed');
    } catch {
      // The panel still opens and closes; only the memory of it is lost.
    }
  }, []);

  return { isOpen, setOpen };
}

/**
 * The retrieval the rail describes: the newest turn that searched.
 *
 * One turn, not the thread. Rank, score and depth all describe a single
 * retrieval, so merging turns would build a card whose number came from one
 * question and whose score came from another.
 *
 * `pendingRetrieval` wins while a turn is in flight. The `retrieval` event is
 * sent **before the first token**, so the rail fills in as the answer arrives
 * rather than snapping into place after it — and that pending turn is by
 * definition newer than anything already filed by message id.
 *
 * Returns `undefined` when no turn in this thread searched — a conversation
 * thread, a `MODEL_ONLY` scope, or a thread reopened from storage, where
 * nothing hydrates the store. The rail is hidden entirely then, rather than
 * showing an empty panel that would read as "searched and found nothing".
 */
export function useLatestRetrieval(
  messages: readonly MessageDto[],
): MessageRetrieval | undefined {
  const retrievalByMessage = useSelector(
    (state: RootState) => state.assistant.retrievalByMessage,
  );
  const pendingRetrieval = useSelector(
    (state: RootState) => state.assistant.pendingRetrieval,
  );

  if (pendingRetrieval) {
    return pendingRetrieval;
  }

  // Newest first, by message order rather than by insertion order into the
  // map. A regenerated answer re-files an existing id, so the map's own key
  // order stops matching the transcript.
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const retrieval = retrievalByMessage[messages[index].id];
    if (retrieval) {
      return retrieval;
    }
  }

  return undefined;
}
