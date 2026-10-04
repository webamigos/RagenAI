'use client';

import type { ReactNode } from 'react';

import { usePathname } from '@/i18n/routing';

import { isMenuSectionPath } from './return-path';

/**
 * Renders its children everywhere except inside `/organization` and
 * `/settings`, where that section's menu takes the sidebar's place. Wraps the
 * parts of the sidebar that are *the main menu* — the actions, the library,
 * the thread history — while the brand row above them and the organization
 * switcher and user menu below stay put.
 */
export function OutsideSectionMenu({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return isMenuSectionPath(pathname) ? null : <>{children}</>;
}
