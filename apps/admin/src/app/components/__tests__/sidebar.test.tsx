import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

vi.mock('@/lib/auth-client', () => ({
  signOut: vi.fn(),
}));

import { Sidebar, SidebarProvider } from '../Sidebar';

function render(props: Parameters<typeof Sidebar>[0] = {}): string {
  return renderToStaticMarkup(
    <SidebarProvider>
      <Sidebar {...props} />
    </SidebarProvider>,
  );
}

/**
 * The one destination in this panel that is not a page of this panel.
 *
 * bull-board runs in the worker, on its own port and behind its own Basic
 * Auth, so the link is external and its address is configuration. Everything
 * asserted here is a way of getting that wrong that would reach an operator:
 * a dead link on an install that runs no dashboard, or a link that opens in
 * place and drops them out of the admin app.
 */
describe('Sidebar, queue dashboard link', () => {
  it('is absent when no dashboard address is configured', () => {
    const markup = render();

    // A visible link to a port that answers nothing is worse than no link:
    // it reads as "the dashboard is broken" rather than "not configured".
    expect(markup).not.toContain('Queue Dashboard');
  });

  it('links out to the configured dashboard', () => {
    const markup = render({ queueDashboardUrl: 'http://worker.internal:8090' });

    expect(markup).toContain('Queue Dashboard');
    expect(markup).toContain('href="http://worker.internal:8090"');
  });

  it('opens it in a new tab, without handing over the referrer', () => {
    const markup = render({ queueDashboardUrl: 'http://worker.internal:8090' });

    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noreferrer"');
  });

  it('still renders the panel’s own navigation either way', () => {
    // Guard on the guard: an exception thrown while rendering the new branch
    // would otherwise show up only as a missing string above.
    for (const markup of [
      render(),
      render({ queueDashboardUrl: 'http://localhost:8090' }),
    ]) {
      expect(markup).toContain('Organizations');
      expect(markup).toContain('AI Usage');
    }
  });
});
