import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import messages from '@/app/messages/en.json';
import { filterSettingsPages } from '@/features/settings/filter';
import {
  organizationRegistry,
  settingsRegistry,
} from '@/features/settings/registry';

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

import { SectionSidebarBody, type SectionNavItem } from '../SectionSidebarBody';
import { OutsideSectionMenu } from '../OutsideSectionMenu';
import { RememberLastPage } from '../RememberLastPage';
import { RETURN_PATH_KEY } from '../return-path';

const admin = {
  isAppAdmin: false,
  canManageOrg: true,
  isOrgOwner: false,
  featureFlags: {},
};

const member = { ...admin, canManageOrg: false };

const toItems = (
  ctx: typeof admin,
  registry = organizationRegistry,
): SectionNavItem[] =>
  filterSettingsPages(registry, ctx).map(({ id, path, labelKey, icon }) => ({
    id,
    path,
    labelKey,
    icon,
  }));

const t = messages['organization-page'].nav;

function renderBody(items: readonly SectionNavItem[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SectionSidebarBody
        section="organization"
        titleKey="organization-page.title"
        items={items}
      />
    </NextIntlClientProvider>,
  );
}

function renderSettings(items: readonly SectionNavItem[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SectionSidebarBody
        section="settings"
        titleKey="settings-page.title"
        items={items}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  pathname.current = '/organization/profile';
  query.current = '';
  window.sessionStorage.clear();
});

describe('SectionSidebarBody: the organization', () => {
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
    window.sessionStorage.setItem(RETURN_PATH_KEY, '/chats/abc');
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

describe('SectionSidebarBody: settings', () => {
  const nav = messages['settings-page'].nav;

  beforeEach(() => {
    pathname.current = '/settings/general';
  });

  it('lists the user’s own pages, to any member', () => {
    renderSettings(toItems(member, settingsRegistry));

    expect(screen.getByRole('link', { name: nav.general })).toHaveAttribute(
      'href',
      '/settings/general',
    );
    expect(screen.getByRole('link', { name: nav.account })).toHaveAttribute(
      'href',
      '/settings/account',
    );
    expect(
      screen.getByText(messages['settings-page'].title),
    ).toBeInTheDocument();
  });

  it('lists none of the organization’s pages, Knowledge analytics and PII policy included', () => {
    // They used to sit in the settings rail under "Privacy" and "Organization",
    // even for an administrator; they are in the organization menu now.
    renderSettings(toItems(admin, settingsRegistry));

    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toMatch(/^\/organization/);
    }
    expect(
      screen.queryByRole('link', { name: t['knowledge-analytics'] }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: t['pii-policy'] }),
    ).not.toBeInTheDocument();
  });

  it('has its own way back, to the page settings were entered from', async () => {
    window.sessionStorage.setItem(RETURN_PATH_KEY, '/chats/abc');
    renderSettings(toItems(member, settingsRegistry));

    expect(await screen.findByTestId('settings-back')).toHaveAttribute(
      'href',
      '/chats/abc',
    );
  });

  it('renders nothing inside the organization, where that menu is drawn instead', () => {
    pathname.current = '/organization/profile';
    const { container } = renderSettings(toItems(member, settingsRegistry));

    expect(container).toBeEmptyDOMElement();
  });

  it('leaves the organization’s menu out of /settings', () => {
    const { container } = renderBody(toItems(admin));

    expect(container).toBeEmptyDOMElement();
  });
});

describe('OutsideSectionMenu', () => {
  it('shows its children outside the section and hides them inside it', () => {
    pathname.current = '/chats/abc';
    const outside = render(
      <OutsideSectionMenu>
        <span>main menu</span>
      </OutsideSectionMenu>,
    );
    expect(outside.queryByText('main menu')).toBeInTheDocument();
    outside.unmount();

    for (const path of ['/organization/teams', '/settings/account']) {
      pathname.current = path;
      const inside = render(
        <OutsideSectionMenu>
          <span>main menu</span>
        </OutsideSectionMenu>,
      );
      expect(inside.queryByText('main menu')).not.toBeInTheDocument();
      inside.unmount();
    }
  });
});

describe('RememberLastPage', () => {
  it('remembers a page outside the section', () => {
    pathname.current = '/projects';
    render(<RememberLastPage />);

    expect(window.sessionStorage.getItem(RETURN_PATH_KEY)).toBe('/projects');
  });

  it('remembers the query string with the path', () => {
    pathname.current = '/knowledge-base';
    query.current = 'folder=abc';
    render(<RememberLastPage />);

    expect(window.sessionStorage.getItem(RETURN_PATH_KEY)).toBe(
      '/knowledge-base?folder=abc',
    );
  });

  it('remembers a change of query alone, on the same path', () => {
    pathname.current = '/knowledge-base';
    query.current = 'folder=abc';
    const { rerender } = render(<RememberLastPage />);

    query.current = 'folder=def';
    rerender(<RememberLastPage />);

    expect(window.sessionStorage.getItem(RETURN_PATH_KEY)).toBe(
      '/knowledge-base?folder=def',
    );
  });

  it('does not overwrite it with a page inside the section', () => {
    window.sessionStorage.setItem(RETURN_PATH_KEY, '/chats/abc');
    pathname.current = '/organization/members';
    render(<RememberLastPage />);

    expect(window.sessionStorage.getItem(RETURN_PATH_KEY)).toBe('/chats/abc');
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
