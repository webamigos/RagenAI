import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import messages from '@/app/messages/en.json';
import { filterSettingsPages } from '@/features/settings/filter';
import { organizationRegistry } from '@/features/settings/registry';

const pathname = vi.hoisted(() => ({ current: '/organization/profile' }));
const query = vi.hoisted(() => ({ current: '' }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(query.current),
}));

vi.mock('@/i18n/routing', () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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

import {
  OrganizationSidebarBody,
  type OrganizationNavItem,
} from '../OrganizationSidebarBody';
import { OutsideOrganization } from '../OutsideOrganization';
import { RememberLastPage } from '../RememberLastPage';
import { ORGANIZATION_RETURN_KEY } from '../return-path';

const admin = {
  isAppAdmin: false,
  canManageOrg: true,
  isOrgOwner: false,
  featureFlags: {},
};

const toItems = (ctx: typeof admin): OrganizationNavItem[] =>
  filterSettingsPages(organizationRegistry, ctx).map(
    ({ id, path, labelKey, icon }) => ({ id, path, labelKey, icon }),
  );

const t = messages['organization-page'].nav;

function renderBody(items: readonly OrganizationNavItem[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OrganizationSidebarBody items={items} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  pathname.current = '/organization/profile';
  query.current = '';
  window.sessionStorage.clear();
});

describe('OrganizationSidebarBody', () => {
  it('lists the organization pages, each linking to its page', () => {
    renderBody(toItems(admin));

    expect(screen.getByRole('link', { name: t.connectors })).toHaveAttribute(
      'href',
      '/organization/connectors',
    );
    expect(screen.getByRole('link', { name: t.chatbots })).toHaveAttribute(
      'href',
      '/organization/chatbots',
    );
  });

  it('does not list Subscription', () => {
    // Plans are not sold from inside the panel, so an entry only led to a page
    // nobody could act on. The route stays for the Stripe return flows.
    renderBody(toItems(admin));

    expect(
      screen.queryByRole('link', { name: t.subscription }),
    ).not.toBeInTheDocument();
  });

  it('marks the page the reader is on as current, and only that one', () => {
    pathname.current = '/organization/chatbots';
    renderBody(toItems(admin));

    expect(screen.getByRole('link', { name: t.chatbots })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.getByRole('link', { name: t.connectors }),
    ).not.toHaveAttribute('aria-current');
  });

  it('draws what it is given and nothing else — filtering is the layout’s job', () => {
    const [first] = toItems(admin);
    renderBody([first]);

    // Back control plus the one entry.
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('shows the section’s title and the way back', () => {
    renderBody(toItems(admin));

    expect(
      screen.getByText(messages['organization-page'].title),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: messages.sidebar['back-to-main-menu'] }),
    ).toBeInTheDocument();
  });

  it('goes back to a new chat when nothing was remembered', () => {
    renderBody(toItems(admin));

    expect(screen.getByTestId('organization-back')).toHaveAttribute(
      'href',
      '/new',
    );
  });

  it('goes back to the page the section was entered from', async () => {
    window.sessionStorage.setItem(ORGANIZATION_RETURN_KEY, '/chats/abc');
    renderBody(toItems(admin));

    // Read after mount, so the first render is the same on server and client.
    expect(await screen.findByTestId('organization-back')).toHaveAttribute(
      'href',
      '/chats/abc',
    );
  });

  it('renders nothing outside the section', () => {
    pathname.current = '/chats/abc';
    const { container } = renderBody(toItems(admin));

    expect(container).toBeEmptyDOMElement();
  });
});

describe('OutsideOrganization', () => {
  it('shows its children outside the section and hides them inside it', () => {
    pathname.current = '/chats/abc';
    const outside = render(
      <OutsideOrganization>
        <span>main menu</span>
      </OutsideOrganization>,
    );
    expect(outside.queryByText('main menu')).toBeInTheDocument();
    outside.unmount();

    pathname.current = '/organization/teams';
    const inside = render(
      <OutsideOrganization>
        <span>main menu</span>
      </OutsideOrganization>,
    );
    expect(inside.queryByText('main menu')).not.toBeInTheDocument();
  });
});

describe('RememberLastPage', () => {
  it('remembers a page outside the section', () => {
    pathname.current = '/projects';
    render(<RememberLastPage />);

    expect(window.sessionStorage.getItem(ORGANIZATION_RETURN_KEY)).toBe(
      '/projects',
    );
  });

  it('remembers the query string with the path', () => {
    pathname.current = '/knowledge-base';
    query.current = 'folder=abc';
    render(<RememberLastPage />);

    expect(window.sessionStorage.getItem(ORGANIZATION_RETURN_KEY)).toBe(
      '/knowledge-base?folder=abc',
    );
  });

  it('remembers a change of query alone, on the same path', () => {
    pathname.current = '/knowledge-base';
    query.current = 'folder=abc';
    const { rerender } = render(<RememberLastPage />);

    query.current = 'folder=def';
    rerender(<RememberLastPage />);

    expect(window.sessionStorage.getItem(ORGANIZATION_RETURN_KEY)).toBe(
      '/knowledge-base?folder=def',
    );
  });

  it('does not overwrite it with a page inside the section', () => {
    window.sessionStorage.setItem(ORGANIZATION_RETURN_KEY, '/chats/abc');
    pathname.current = '/organization/members';
    render(<RememberLastPage />);

    expect(window.sessionStorage.getItem(ORGANIZATION_RETURN_KEY)).toBe(
      '/chats/abc',
    );
  });

  it('survives storage that throws', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    pathname.current = '/projects';

    expect(() => render(<RememberLastPage />)).not.toThrow();

    spy.mockRestore();
  });
});
