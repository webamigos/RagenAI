import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CollapsedSidebarRail } from '../CollapsedSidebarRail';

vi.mock('@ragenai/tui/sidebar-layout', () => ({
  useSidebarCollapse: () => ({ toggle: vi.fn() }),
}));

vi.mock('@/app/hooks/use-auth', () => ({
  useUser: () => ({
    user: { id: 'u1', name: 'Test User', email: 'test@example.com' },
  }),
}));

vi.mock('@/app/hooks/use-better-auth', () => ({
  signOut: vi.fn(),
}));

vi.mock('@/app/hooks/useSearchThreadsContext', () => ({
  useSearchThreads: () => ({ openSearch: vi.fn() }),
}));

vi.mock('@/i18n/routing', () => ({
  usePathname: () => '/new',
  Link: ({
    children,
    href,
    ...props
  }: React.PropsWithChildren<{ href: string; [key: string]: unknown }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const messages = {
  sidebar: {
    'toggle-sidebar': 'Przełącz pasek boczny',
    'new-chat': 'Nowy czat',
    'user-menu': 'Menu użytkownika',
    search: 'Szukaj',
    nav: {
      chats: 'Wątki',
      assistants: 'Asystenci',
    },
    footer: {
      'my-profile': 'Mój profil',
      settings: 'Ustawienia',
      'sign-out': 'Wyloguj się',
    },
  },
};

function renderRail() {
  return render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <CollapsedSidebarRail />
    </NextIntlClientProvider>,
  );
}

describe('CollapsedSidebarRail', () => {
  it('localizes every icon-button aria-label instead of using hardcoded English', () => {
    renderRail();

    expect(
      screen.getByRole('button', { name: 'Przełącz pasek boczny' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nowy czat' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Szukaj' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Wątki' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Asystenci' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Menu użytkownika' }),
    ).toBeInTheDocument();

    // None of the old hardcoded English labels should remain.
    for (const stale of [
      'Open sidebar',
      'New chat',
      'Search',
      'Chats',
      'Projects',
      'Leads',
      'User menu',
    ]) {
      expect(
        screen.queryByRole('button', { name: stale }) ??
          screen.queryByRole('link', { name: stale }),
      ).not.toBeInTheDocument();
    }
  });
});
