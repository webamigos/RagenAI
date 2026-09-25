import type { ReactNode } from 'react';

import { PageDrawerHost } from '../components/PageDrawer';

/**
 * The graph with a slot beside it. Opening a page from the graph fills
 * `drawer` (`@drawer/(..)pages/[pageId]`) instead of leaving the graph, so
 * the picked page, the camera and any page moved by hand are still there
 * when the drawer closes. A reload or a shared link skips the slot and opens
 * the full page, as before.
 */
export default function BrainGraphLayout({
  children,
  drawer,
}: {
  children: ReactNode;
  drawer: ReactNode;
}) {
  return (
    <PageDrawerHost>
      <div className="relative">
        {children}
        {drawer}
      </div>
    </PageDrawerHost>
  );
}
