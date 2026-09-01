'use client';

import { ThemeProvider, useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
import { Provider } from 'react-redux';
import { store } from '@/store';
import { Toaster } from '@/components/ui/sonner';
import { Notifications } from '@ragenai/common-ui/Notifications';

type Props = {
  readonly children: React.ReactNode;
};

// Snaps back to "system" if the OS-level color scheme changes to match
// whatever theme is currently resolved — e.g. the user explicitly picked
// "dark" while their OS was already dark, then later the OS itself switches
// to dark (from light) again: the app should resume following the OS
// automatically rather than staying pinned to the stale explicit choice.
//
// This must only react to a real, live OS-level `change` event — not fire
// merely because `resolvedTheme` changed (e.g. the user just picked a theme
// in Settings). Depending on `resolvedTheme` in the effect would re-run
// `onMediaChange()` on every such pick, and if it happened to already match
// the OS preference, silently rewrite the user's explicit choice back to
// "system" behind their back. A ref keeps the latest value available to the
// listener without making it part of the effect's dependencies.
export function ThemeWatcher() {
  const { resolvedTheme, setTheme } = useTheme();
  const resolvedThemeRef = useRef(resolvedTheme);

  useEffect(() => {
    resolvedThemeRef.current = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    function onMediaChange() {
      const systemTheme = media.matches ? 'dark' : 'light';
      if (resolvedThemeRef.current === systemTheme) {
        setTheme('system');
      }
    }

    media.addEventListener('change', onMediaChange);

    return () => {
      media.removeEventListener('change', onMediaChange);
    };
  }, [setTheme]);

  return null;
}

export function Providers({ children }: Props) {
  return (
    <Provider store={store}>
      <ThemeProvider attribute="class" defaultTheme="system">
        <ThemeWatcher />
        {children}
        <Notifications />
        <Toaster position="top-right" richColors closeButton />
      </ThemeProvider>
    </Provider>
  );
}
