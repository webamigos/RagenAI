import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';

// Signed in from the first client render: better-auth's store had the session
// before this part of the page hydrated — the race that produced #418.
vi.mock('@/app/hooks/use-auth', () => ({
  useUser: () => ({ isLoaded: true, isSignedIn: true }),
}));
vi.mock('@/app/hooks/use-better-auth', () => ({ signOut: vi.fn() }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useParams: () => ({ locale: 'en' }),
}));
vi.mock('@ragenai/common-ui/SidebarLayout', () => ({
  SidebarLayout: ({ children }: React.PropsWithChildren) => (
    <main data-testid="shell">{children}</main>
  ),
}));
vi.mock('@/app/components/Sidebar/CollapsedSidebarRail', () => ({
  CollapsedSidebarRail: () => null,
}));
vi.mock('@/app/components/ImpersonationBanner', () => ({
  ImpersonationBanner: () => null,
}));

import { PanelLayoutWrapper } from '../PanelLayoutWrapper';

const tree = (
  <PanelLayoutWrapper navbar={null} sidebar={null}>
    <p>page</p>
  </PanelLayoutWrapper>
);

describe('PanelLayoutWrapper', () => {
  it('hydrates the server placeholder without a mismatch, then shows the shell', async () => {
    // What the server sent: jsdom has a `window`, so render the server pass
    // with it hidden, as it is in Node.
    const realWindow = globalThis.window;
    // @ts-expect-error — simulating the server
    delete globalThis.window;
    let html: string;
    try {
      html = renderToString(tree);
    } finally {
      globalThis.window = realWindow;
    }
    expect(html).not.toContain('page');

    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    const recoverable = vi.fn();
    await act(async () => {
      hydrateRoot(container, tree, { onRecoverableError: recoverable });
    });

    expect(recoverable).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="shell"]')).not.toBeNull();
    expect(container.textContent).toContain('page');
  });
});
