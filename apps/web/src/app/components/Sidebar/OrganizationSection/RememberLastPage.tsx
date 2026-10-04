'use client';

import { useEffect } from 'react';

import { usePathname } from '@/i18n/routing';

import { rememberPage } from './return-path';

/**
 * Records the page the reader is on, so the organization section's "Main menu"
 * can take them back to it. Renders nothing; mounted once in the panel layout,
 * which persists across navigations, so it sees every page including the ones
 * visited before the section was entered.
 */
export function RememberLastPage() {
  const pathname = usePathname();

  useEffect(() => {
    try {
      rememberPage(window.sessionStorage, pathname, window.location.search);
    } catch {
      // Storage can be blocked or full. The back control then goes to the
      // default, which is the right answer for a page that remembers nothing.
    }
  }, [pathname]);

  return null;
}
