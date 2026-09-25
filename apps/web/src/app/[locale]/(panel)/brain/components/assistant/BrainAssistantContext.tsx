'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { BrainScreenContext } from '@/features/brain-assistant/contracts/brain-assistant.types';

type ScreenState = {
  screen: BrainScreenContext;
  setScreen: (screen: BrainScreenContext) => void;
};

const DEFAULT_SCREEN: BrainScreenContext = { view: 'pages', status: null };

const ScreenContext = createContext<ScreenState | null>(null);

/**
 * What is on the Brain screen, held above the pages so the panel beside them
 * keeps its conversation while the operator moves between views. Each page
 * says what it shows with `<BrainScreen>`; nothing parses the URL.
 */
export function BrainScreenProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<BrainScreenContext>(DEFAULT_SCREEN);
  const value = useMemo(() => ({ screen, setScreen }), [screen]);
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
 * by value so a server re-render with the same screen does not reset it.
 */
export function BrainScreen({ context }: { context: BrainScreenContext }) {
  const set = useContext(ScreenContext)?.setScreen;
  const key = JSON.stringify(context);
  useEffect(() => {
    set?.(JSON.parse(key) as BrainScreenContext);
  }, [set, key]);
  return null;
}
