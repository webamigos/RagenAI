import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { CollapsedSidebarRail } from '../CollapsedSidebarRail';

vi.mock('@ragenai/common-ui/SidebarLayout', () => ({
  useSidebarCollapse: () => ({ toggle: vi.fn() }),
}));

const { mockCanManageOrg } = vi.hoisted(() => ({
  mockCanManageOrg: { value: true },
}));

vi.mock('@/app/hooks/use-auth', () => ({
  useUser: () => ({
    user: { id: 'u1', name: 'Test User', email: 'test@example.com' },
  }),
  useOrganization: () => ({ canManageOrg: mockCanManageOrg.value }),
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
    'manage-knowledge': 'Baza wiedzy',
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
  describe('the Knowledge destination', () => {
    // The rail is a second rendering of the same navigation as the expanded
    // sidebar, so a permission applied in one and forgotten in the other is
    // how a hidden destination becomes a visible one for everybody.
    afterEach(() => {
      mockCanManageOrg.value = true;
    });

    it('is offered to someone who can manage the organization', () => {
      renderRail();

      expect(screen.getByRole('link', { name: 'Baza wiedzy' })).toHaveAttribute(
        'href',
        '/knowledge/documents-list',
      );
    });

    it('is withheld from everyone else, as in the expanded sidebar', () => {
      mockCanManageOrg.value = false;

      renderRail();

      expect(
        screen.queryByRole('link', { name: 'Baza wiedzy' }),
      ).not.toBeInTheDocument();
    });
  });

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

  // ADR-41 asks for the Headless-UI-to-Radix swaps to be checked against a
  // keyboard rather than by eye, because focus handling is comparable between
  // the two but not identical. This menu is behind authentication, so the
  // keyboard path is asserted here instead of clicked through by hand.
  describe('the user menu, driven by keyboard', () => {
    it('opens on Enter and exposes its items as a menu', async () => {
      const user = userEvent.setup();
      renderRail();

      const trigger = screen.getByRole('button', { name: 'Menu użytkownika' });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();

      trigger.focus();
      await user.keyboard('{Enter}');

      expect(await screen.findByRole('menu')).toBeInTheDocument();
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(
        screen.getByRole('menuitem', { name: 'Mój profil' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('menuitem', { name: 'Ustawienia' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('menuitem', { name: 'Wyloguj się' }),
      ).toBeInTheDocument();
    });

    it('moves focus onto the first item with ArrowDown, and closes on Escape', async () => {
      const user = userEvent.setup();
      renderRail();

      const trigger = screen.getByRole('button', { name: 'Menu użytkownika' });
      trigger.focus();
      await user.keyboard('{ArrowDown}');

      expect(await screen.findByRole('menu')).toBeInTheDocument();
      expect(
        screen.getByRole('menuitem', { name: 'Mój profil' }),
      ).toHaveFocus();

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });
  });
});
