import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

const setActive = vi.hoisted(() => vi.fn());
const switchOrganizationCommand = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());

vi.mock('@/app/hooks/use-better-auth', () => ({
  authClient: { organization: { setActive } },
}));
vi.mock(
  '@/features/organizations/services/commands/switch-organization-command',
  () => ({ switchOrganizationCommand }),
);
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push }),
  Link: ({
    children,
    href,
    ...props
  }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('@ragenai/common-ui/SidebarLayout', () => ({
  useMobileSidebar: () => ({ closeSidebar: vi.fn() }),
}));

import { OrganizationSwitcher } from '../OrganizationSwitcher';

const messages = {
  sidebar: {
    'manage-organization': 'Organization',
    'organization-settings': 'Organization Settings',
    'create-organization': 'Create organization',
    'switch-organization': 'Switch organization',
  },
};

const organizations = [
  { id: 'org-1', name: 'Demo', slug: 'demo', logo: null },
  { id: 'org-2', name: 'Acme', slug: 'acme', logo: null },
];

function renderSwitcher(
  props: Partial<React.ComponentProps<typeof OrganizationSwitcher>> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OrganizationSwitcher
        organizations={organizations}
        activeOrganizationId="org-1"
        isAppAdmin
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe('OrganizationSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActive.mockResolvedValue(undefined);
    switchOrganizationCommand.mockResolvedValue(undefined);
  });

  it('names the active organization in the trigger', () => {
    renderSwitcher();

    expect(screen.getByRole('button', { name: 'Demo' })).toBeInTheDocument();
  });

  it('falls back to a generic label when no organization is active', () => {
    renderSwitcher({ activeOrganizationId: null });

    expect(
      screen.getByRole('button', { name: 'Organization' }),
    ).toBeInTheDocument();
  });

  it('hands its className to the item wrapper so the header can size it', () => {
    // The header lays this out beside the collapse button as `min-w-0 flex-1`;
    // if the class did not reach the wrapper the burger would be pushed off.
    renderSwitcher({ className: 'min-w-0 flex-1' });

    const item = screen.getByRole('button', { name: 'Demo' });
    expect(item.parentElement).toHaveClass('min-w-0', 'flex-1');
  });

  it('renders a static item, not a menu, for someone who is not a platform admin', async () => {
    const user = userEvent.setup();
    renderSwitcher({ isAppAdmin: false });

    await user.click(screen.getByRole('button', { name: 'Demo' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByText('Acme')).not.toBeInTheDocument();
  });

  it('offers the other organizations and the two links to a platform admin', async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole('button', { name: 'Demo' }));

    expect(screen.getByRole('menuitem', { name: /Acme/ })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Organization Settings' }),
    ).toHaveAttribute('href', '/organization/profile');
    expect(
      screen.getByRole('menuitem', { name: 'Create organization' }),
    ).toHaveAttribute('href', '/settings/create-organization');
  });

  it('switches the active organization and goes to a new chat', async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.click(screen.getByRole('button', { name: 'Demo' }));
    await user.click(screen.getByRole('menuitem', { name: /Acme/ }));

    await vi.waitFor(() => {
      expect(setActive).toHaveBeenCalledWith({ organizationId: 'org-2' });
      expect(switchOrganizationCommand).toHaveBeenCalledWith('org-2');
      expect(push).toHaveBeenCalledWith('/new');
    });
  });
});
