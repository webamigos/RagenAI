'use client';

import {
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useLocale, useTranslations } from 'next-intl';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

import { useRouter } from '@/i18n/routing';

type Host = {
  /** A drawer showing `pageId` mounted. */
  opened: (pageId: string) => void;
  /** How many history entries the drawer is away from the graph. */
  depth: () => number;
  /** The slot went empty: the next drawer starts a new trail. */
  closed: () => void;
};

const HostContext = createContext<Host | null>(null);

/**
 * Keeps the trail of pages the drawer has shown, so closing it goes back to
 * the graph in one step even after the operator followed a relation from one
 * page to the next inside it. Browser back through the trail is read as
 * going back, not as opening the previous page anew.
 */
export function PageDrawerHost({ children }: { children: ReactNode }) {
  const trail = useRef<string[]>([]);
  const opened = useCallback((pageId: string) => {
    const pages = trail.current;
    if (pages.at(-1) === pageId) {
      return;
    }
    if (pages.at(-2) === pageId) {
      pages.pop();
      return;
    }
    pages.push(pageId);
  }, []);
  const depth = useCallback(() => trail.current.length, []);
  const closed = useCallback(() => {
    trail.current = [];
  }, []);
  const host = useMemo(
    () => ({ opened, depth, closed }),
    [opened, depth, closed],
  );
  return <HostContext.Provider value={host}>{children}</HostContext.Provider>;
}

/**
 * A knowledge page over the graph's right side (the legend's column and a
 * little of the canvas), leaving the rest of the graph and the assistant in
 * view. Not modal: the graph stays usable, and picking another page there
 * shows it here. Full-screen on a phone, where there is no side to keep.
 */
export function PageDrawer({
  pageId,
  children,
}: {
  pageId: string;
  children: ReactNode;
}) {
  const t = useTranslations('brain.graph');
  const locale = useLocale();
  const router = useRouter();
  const host = useContext(HostContext);
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    host?.opened(pageId);
    // Keyboard focus follows the page it opened, so a screen reader hears it
    // and Escape reaches the drawer.
    panel.current?.focus({ preventScroll: true });
  }, [host, pageId]);

  const close = () => {
    const steps = Math.max(1, host?.depth() ?? 1);
    if (steps === 1) {
      router.back();
    } else {
      window.history.go(-steps);
    }
  };

  return (
    <aside
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-label={t('drawer-label')}
      data-testid="brain-page-drawer"
      onKeyDown={(e) => {
        // Only from inside the drawer's own DOM: a dialog it opened is
        // portalled elsewhere, and its Escape closes that dialog, not this.
        if (
          e.key === 'Escape' &&
          e.currentTarget.contains(e.target as Node) &&
          !e.defaultPrevented
        ) {
          close();
        }
      }}
      className="fixed inset-0 z-40 flex flex-col bg-card focus:outline-none lg:absolute lg:inset-y-0 lg:left-auto lg:right-0 lg:z-30 lg:w-[min(640px,100%)] lg:rounded-[6px] lg:border lg:border-border lg:shadow-lg"
    >
      <header className="flex items-center gap-2 border-b border-border px-4 py-2">
        {/*
          A plain anchor on purpose: the router's Link would be intercepted
          again and open this same drawer.
        */}
        <a
          href={`/${locale}/brain/pages/${pageId}`}
          className="mr-auto inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
          data-testid="brain-page-drawer-full"
        >
          <ArrowTopRightOnSquareIcon className="size-4" aria-hidden="true" />
          {t('drawer-full-page')}
        </a>
        <button
          type="button"
          onClick={close}
          aria-label={t('drawer-close')}
          title={t('drawer-close')}
          data-testid="brain-page-drawer-close"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <XMarkIcon className="size-4" aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </aside>
  );
}

/**
 * Rendered by the empty slot. The drawer is remounted for every page it
 * shows, so its own unmount cannot tell "closed" from "moved on"; the slot
 * going empty can. The next drawer then starts a new trail.
 */
export function DrawerClosed() {
  const closed = useContext(HostContext)?.closed;
  useEffect(() => {
    closed?.();
  }, [closed]);
  return null;
}
