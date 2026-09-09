import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const closeSidebar = vi.fn();

vi.mock('../../SidebarLayout', () => ({
  useMobileSidebar: () => ({ closeSidebar }),
}));

vi.mock('@/i18n/routing', () => ({
  /**
   * The real `Link` routes on the client and never lets the browser follow the
   * href. Reproducing that matters here because two tests below click it: an
   * unprevented click makes jsdom attempt a real navigation, which it cannot
   * do, and the resulting "Not implemented: navigation" arrives from a timer
   * *after* the assertions have passed — so vitest exits non-zero while
   * reporting every test green, and `npm run verify` goes red for a reason no
   * failing test names.
   */
  Link: ({
    children,
    href,
    onClick,
    ...props
  }: React.PropsWithChildren<{
    href: string;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
    [key: string]: unknown;
  }>) => (
    <a
      href={href}
      data-testid="link"
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));

vi.mock('framer-motion', () => ({
  LayoutGroup: ({ children }: React.PropsWithChildren) => <>{children}</>,
  motion: {
    span: (props: Record<string, unknown>) => (
      <span data-testid="current-indicator" {...props} />
    ),
  },
}));

const { SidebarItem } = await import('../Sidebar');

describe('SidebarItem', () => {
  it('renders a link when given an href', () => {
    render(<SidebarItem href="/chats">Threads</SidebarItem>);

    expect(screen.getByTestId('link')).toHaveAttribute('href', '/chats');
  });

  it('renders a button when given none', () => {
    render(<SidebarItem>Open something</SidebarItem>);

    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.queryByTestId('link')).not.toBeInTheDocument();
  });

  /**
   * The behaviour this component used to get for free. A link item was a
   * Headless UI `CloseButton as={Link}`, so navigating closed the mobile
   * drawer as a side effect nothing named. Replacing it with a plain Link
   * would have left the drawer open over the page the user just navigated to,
   * and no type or test would have noticed.
   */
  it('closes the mobile drawer when a link is followed', () => {
    closeSidebar.mockClear();
    render(<SidebarItem href="/chats">Threads</SidebarItem>);

    fireEvent.click(screen.getByTestId('link'));

    expect(closeSidebar).toHaveBeenCalledTimes(1);
  });

  it('still calls the caller’s own onClick', () => {
    closeSidebar.mockClear();
    const onClick = vi.fn();
    render(
      <SidebarItem href="/chats" onClick={onClick}>
        Threads
      </SidebarItem>,
    );

    fireEvent.click(screen.getByTestId('link'));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(closeSidebar).toHaveBeenCalledTimes(1);
  });

  it('leaves the drawer alone for a button item', () => {
    // Matching the old behaviour deliberately: the non-href branch used
    // HeadlessButton, not CloseButton, so it never closed the drawer — a
    // button opens a menu or a dialog in place and closing would be wrong.
    closeSidebar.mockClear();
    render(<SidebarItem>Open something</SidebarItem>);

    fireEvent.click(screen.getByRole('button'));

    expect(closeSidebar).not.toHaveBeenCalled();
  });

  it('marks the current item, for the indicator and for assistive tech', () => {
    render(
      <SidebarItem href="/chats" current>
        Threads
      </SidebarItem>,
    );

    expect(screen.getByTestId('current-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('link')).toHaveAttribute('data-current', 'true');
  });

  it('omits both when the item is not current', () => {
    render(<SidebarItem href="/chats">Threads</SidebarItem>);

    expect(screen.queryByTestId('current-indicator')).not.toBeInTheDocument();
    expect(screen.getByTestId('link')).not.toHaveAttribute('data-current');
  });
});
