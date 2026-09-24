import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import en from '@/app/messages/en.json';

const { who } = vi.hoisted(() => ({
  who: {
    isAppAdmin: false,
    canManageOrg: false,
    canOwnOrg: false,
  },
}));

vi.mock('@/app/hooks/use-auth', () => ({
  useUser: () => ({
    user: { id: 'u1', name: 'Anna Walker', email: 'anna@example.com' },
    isAppAdmin: who.isAppAdmin,
  }),
  useOrganization: () => ({
    canManageOrg: who.canManageOrg,
    canOwnOrg: who.canOwnOrg,
  }),
}));

vi.mock('@/app/hooks/use-better-auth', () => ({ signOut: vi.fn() }));
vi.mock('@ragenai/common-ui/SidebarLayout', () => ({
  useMobileSidebar: () => ({ closeSidebar: vi.fn() }),
}));
vi.mock('@/libs/navigation/hard-navigate', () => ({ hardNavigate: vi.fn() }));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href}>{children}</a>
  ),
}));

import { SidebarFooterMenu } from '../SidebarFooterMenu';

function renderMenu() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SidebarFooterMenu />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  who.isAppAdmin = false;
  who.canManageOrg = false;
  who.canOwnOrg = false;
});

describe('SidebarFooterMenu — the role under your name', () => {
  // An owner can also manage the org, and asking only that labelled every
  // owner "Org Admin".
  it('calls an owner an owner', () => {
    who.canManageOrg = true;
    who.canOwnOrg = true;
    renderMenu();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.queryByText('Org Admin')).not.toBeInTheDocument();
  });

  it('calls an admin who is not the owner an org admin', () => {
    who.canManageOrg = true;
    renderMenu();
    expect(screen.getByText('Org Admin')).toBeInTheDocument();
  });

  it('puts the platform role first', () => {
    who.isAppAdmin = true;
    who.canManageOrg = true;
    who.canOwnOrg = true;
    renderMenu();
    expect(screen.getByText('App Admin')).toBeInTheDocument();
  });

  it('calls a member a user', () => {
    renderMenu();
    expect(screen.getByText('User')).toBeInTheDocument();
  });
});
