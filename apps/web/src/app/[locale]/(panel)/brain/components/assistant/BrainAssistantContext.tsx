'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { BrainScreenContext } from '@/features/brain-assistant/contracts/brain-assistant.types';

type Entry = { id: number; screen: BrainScreenContext };

type ScreenState = {
  screen: BrainScreenContext;
  put: (id: number, screen: BrainScreenContext) => void;
  remove: (id: number) => void;
};

const DEFAULT_SCREEN: BrainScreenContext = { view: 'pages', status: null };

const ScreenContext = createContext<ScreenState | null>(null);

let nextId = 0;

/**
 * What is on the Brain screen, held above the pages so the panel beside them
 * keeps its conversation while the operator moves between views. Each page
 * says what it shows with `<BrainScreen>`; nothing parses the URL.
 *
 * A stack, not one value: a page opened in the graph's drawer sits over the
 * graph, and closing it must hand the panel back the graph — whose own
 * `<BrainScreen>` never re-announced itself, because it never changed.
 */
export function BrainScreenProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const put = useCallback((id: number, screen: BrainScreenContext) => {
    setEntries((current) =>
      current.some((e) => e.id === id)
        ? current.map((e) => (e.id === id ? { id, screen } : e))
        : [...current, { id, screen }],
    );
  }, []);
  const remove = useCallback((id: number) => {
    setEntries((current) => current.filter((e) => e.id !== id));
  }, []);
  const screen = entries.at(-1)?.screen ?? DEFAULT_SCREEN;
  const value = useMemo(() => ({ screen, put, remove }), [screen, put, remove]);
  return (
    <ScreenContext.Provider value={value}>{children}</ScreenContext.Provider>
  );
}

/** The current screen, for the panel. Outside the provider: the pages list. */
export function useBrainScreen(): BrainScreenContext {
  return useContext(ScreenContext)?.screen ?? DEFAULT_SCREEN;
}

/**
 * Rendered by each Brain page with what it shows. Renders nothing; compared
 * by value so a server re-render with the same screen does not reset it. The
 * latest one mounted wins, and unmounting hands back the one below it.
 */
export function BrainScreen({ context }: { context: BrainScreenContext }) {
  const state = useContext(ScreenContext);
  const put = state?.put;
  const remove = state?.remove;
  const [id] = useState(() => ++nextId);
  const key = JSON.stringify(context);
  useEffect(() => {
    put?.(id, JSON.parse(key) as BrainScreenContext);
  }, [put, id, key]);
  useEffect(() => () => remove?.(id), [remove, id]);
  return null;
}
