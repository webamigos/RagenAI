'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

import { usePathname } from '@/i18n/routing';

import { rememberPage } from './return-path';

/**
 * Records the page the reader is on, so a section's "Main menu" (organization
 * or settings) can take them back to it. Renders nothing; mounted once in the panel layout,
 * which persists across navigations, so it sees every page including the ones
 * visited before the section was entered.
 *
 * It listens to the query string as well as the path: a page that changes only
 * its query (a folder, a filter) is a different place to come back to, and the
 * path alone would leave the earlier query remembered.
 */
export function RememberLastPage() {
  const pathname = usePathname();
  const query = useSearchParams()?.toString() ?? '';

  useEffect(() => {
    try {
      rememberPage(window.sessionStorage, pathname, query ? `?${query}` : '');
    } catch {
      // Storage can be blocked or full. The back control then goes to the
      // default, which is the right answer for a page that remembers nothing.
    }
  }, [pathname, query]);

  return null;
}
