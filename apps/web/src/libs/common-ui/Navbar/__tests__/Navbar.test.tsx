import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n/routing', () => ({
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

vi.mock('framer-motion', () => ({
  LayoutGroup: ({ children }: React.PropsWithChildren) => <>{children}</>,
  motion: {
    span: (props: Record<string, unknown>) => (
      <span data-testid="current-indicator" {...props} />
    ),
  },
}));

const { Navbar, NavbarItem, NavbarSection, NavbarLabel } =
  await import('../Navbar');

describe('NavbarItem', () => {
  it('renders a link when given an href', () => {
    render(<NavbarItem href="/chats">Threads</NavbarItem>);

    expect(screen.getByRole('link', { name: 'Threads' })).toHaveAttribute(
      'href',
      '/chats',
    );
  });

  it('renders a button, and calls onClick, when given no href', () => {
    const onClick = vi.fn();
    render(<NavbarItem onClick={onClick}>Open</NavbarItem>);

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  // type="button" matters: these sit inside a <header>, but a NavbarItem is
  // reusable and an implicit submit inside a form would post it.
  it('does not submit a surrounding form', () => {
    render(<NavbarItem>Open</NavbarItem>);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  // The kit's version styled hover and active through `data-hover`/`data-active`,
  // which only Headless UI sets — so on the anchor branch every one of those
  // rules was inert. These are real CSS states now, and both branches get them.
  it.each([
    [
      'link',
      <NavbarItem key="a" href="/chats">
        Threads
      </NavbarItem>,
    ],
    ['button', <NavbarItem key="b">Open</NavbarItem>],
  ])('gives the %s real hover and focus states', (_role, element) => {
    const { container } = render(element);
    const control = container.querySelector('a, button');

    expect(control?.className).toContain('hover:bg-accent');
    expect(control?.className).toContain('focus-visible:outline-ring');
    expect(control?.className).not.toContain('data-hover:');
  });

  it('marks the current item and renders the sliding indicator', () => {
    render(
      <NavbarItem href="/chats" current>
        Threads
      </NavbarItem>,
    );

    expect(screen.getByRole('link')).toHaveAttribute('data-current', 'true');
    expect(screen.getByTestId('current-indicator')).toBeInTheDocument();
  });

  it('renders no indicator when it is not current', () => {
    render(<NavbarItem href="/chats">Threads</NavbarItem>);

    expect(screen.queryByTestId('current-indicator')).not.toBeInTheDocument();
  });
});

describe('Navbar structure', () => {
  it('renders a navigation landmark', () => {
    render(
      <Navbar>
        <NavbarSection>
          <NavbarLabel>Ragen</NavbarLabel>
        </NavbarSection>
      </Navbar>,
    );

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByText('Ragen')).toBeInTheDocument();
  });
});
