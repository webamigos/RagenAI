'use client';

import { SparklesIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Button } from '@/components/ui/button';

import { BrainAssistantPanel } from './BrainAssistantPanel';

const OPEN_KEY = 'ragen.brain-assistant.open';
const WIDTH_KEY = 'ragen.brain-assistant.width';
export const PANEL_WIDTH = { min: 320, max: 720, initial: 400 } as const;

type Ui = { enabled: boolean; open: boolean; setOpen: (open: boolean) => void };
const UiContext = createContext<Ui>({
  enabled: false,
  open: false,
  setOpen: () => {},
});

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A private window: the panel still works, it just does not remember.
  }
}

export function clampWidth(width: number): number {
  return Math.min(
    PANEL_WIDTH.max,
    Math.max(PANEL_WIDTH.min, Math.round(width)),
  );
}

/**
 * Brain's content with the assistant beside it (spec "Panel"). The panel
 * pushes the content rather than covering it — company-budget-app's overlay
 * hid the very page it talked about — and becomes a full-height sheet on a
 * narrow screen. Open state and width are remembered per browser.
 *
 * `enabled` is Brain access plus the `brainAssistant` key, decided by the
 * server layout; without it nothing here renders but the content.
 */
export function BrainAssistantShell({
  enabled,
  canWrite,
  children,
}: {
  enabled: boolean;
  canWrite: boolean;
  children: ReactNode;
}) {
  const [open, setOpenState] = useState(false);
  const [width, setWidthState] = useState<number>(PANEL_WIDTH.initial);
  // Set once the person toggles: what storage said must not undo a click
  // that came before it was read.
  const touched = useRef(false);

  // What this browser remembered, read once mounted: the server renders the
  // panel closed, and reading storage while rendering would not match it.
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const stored = Number(read(WIDTH_KEY));
    const remembered = read(OPEN_KEY) === '1';
    queueMicrotask(() => {
      if (!touched.current) {
        setOpenState(remembered);
      }
      if (Number.isFinite(stored) && stored > 0) {
        setWidthState(clampWidth(stored));
      }
    });
  }, [enabled]);

  const setOpen = useCallback((next: boolean) => {
    touched.current = true;
    setOpenState(next);
    write(OPEN_KEY, next ? '1' : '0');
  }, []);
  const setWidth = useCallback((next: number) => {
    const clamped = clampWidth(next);
    setWidthState(clamped);
    write(WIDTH_KEY, String(clamped));
  }, []);

  return (
    <UiContext.Provider value={{ enabled, open, setOpen }}>
      <div className="flex w-full items-start">
        <div className="min-w-0 flex-1">{children}</div>
        {enabled && open && (
          <BrainAssistantPanel
            canWrite={canWrite}
            width={width}
            onResize={setWidth}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    </UiContext.Provider>
  );
}

/** The header's button that opens and closes the panel. */
export function BrainAssistantToggle() {
  const ui = useContext(UiContext);
  // Nothing, not even a translation lookup, when the assistant is off.
  return ui.enabled ? <ToggleButton {...ui} /> : null;
}

function ToggleButton({ open, setOpen }: Ui) {
  const t = useTranslations('brain.assistant');
  return (
    <Button
      size="sm"
      variant={open ? 'secondary' : 'outline'}
      aria-pressed={open}
      aria-controls="brain-assistant-panel"
      data-testid="brain-assistant-toggle"
      onClick={() => setOpen(!open)}
    >
      <SparklesIcon className="size-4" aria-hidden="true" />
      {t('toggle')}
    </Button>
  );
}
