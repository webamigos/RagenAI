'use client';

import { ThemeProvider, useTheme } from 'next-themes';
import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { store } from '@/store';
import { Toaster } from '@/components/ui/sonner';
import { Notifications } from '@ragenai/common-ui/Notifications';

type Props = {
  readonly children: React.ReactNode;
};

function ThemeWatcher() {
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    function onMediaChange() {
      const systemTheme = media.matches ? 'dark' : 'light';
      if (resolvedTheme === systemTheme) {
        setTheme('system');
      }
    }

    onMediaChange();
    media.addEventListener('change', onMediaChange);

    return () => {
      media.removeEventListener('change', onMediaChange);
    };
  }, [resolvedTheme, setTheme]);

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
