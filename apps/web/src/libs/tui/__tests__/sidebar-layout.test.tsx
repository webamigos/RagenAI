import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SidebarLayout, useMobileSidebar } from '../sidebar-layout';

vi.mock('@headlessui/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@headlessui/react')>();
  return {
    ...actual,
    Dialog: ({
      open,
      children,
    }: {
      open: boolean;
      children: React.ReactNode;
    }) =>
      open ? <div data-testid="mobile-sidebar-dialog">{children}</div> : null,
    DialogBackdrop: () => null,
    DialogPanel: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    CloseButton: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <button {...props}>{children}</button>
    ),
  };
});

vi.mock('../navbar', () => ({
  NavbarItem: ({
    children,
    onClick,
    ...props
  }: React.PropsWithChildren<{
    onClick?: () => void;
    [key: string]: unknown;
  }>) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

function MobileConsumer() {
  const { closeSidebar, openSidebar, isOpen } = useMobileSidebar();
  return (
    <>
      <span data-testid="status">{isOpen ? 'open' : 'closed'}</span>
      <button onClick={openSidebar}>open</button>
      <button onClick={closeSidebar}>close</button>
    </>
  );
}

it('useMobileSidebar exposes open/close and isOpen', () => {
  render(
    <SidebarLayout navbar={<div />} sidebar={<MobileConsumer />}>
      <div />
    </SidebarLayout>,
  );
  // Sidebar is rendered in both the desktop div and the mobile dialog.
  // All status elements should agree on the same state.
  const allStatuses = () => screen.getAllByTestId('status');
  expect(allStatuses().every((el) => el.textContent === 'closed')).toBe(true);
  fireEvent.click(screen.getAllByText('open')[0]);
  expect(allStatuses().every((el) => el.textContent === 'open')).toBe(true);
  fireEvent.click(screen.getAllByText('close')[0]);
  expect(allStatuses().every((el) => el.textContent === 'closed')).toBe(true);
});

/**
 * The shell used to cap content at max-w-6xl on every screen. Pages that need
 * a reading measure set their own (settings max-w-2xl…5xl, chat max-w-3xl/4xl),
 * so the shell cap only ever squeezed the data-dense pages — the knowledge base
 * list scrolled horizontally on a monitor with 500px to spare.
 *
 * Asserting the classes is unlovely, but this is a layout rule with no
 * behaviour to observe in jsdom, and it is the kind of thing a later
 * "simplify the className" edit silently reverts.
 */
describe('main content width', () => {
  function contentWrapper() {
    return screen.getByTestId('content').parentElement;
  }

  it('keeps the 6xl cap as the small-screen default', () => {
    render(
      <SidebarLayout navbar={<div />} sidebar={<div />}>
        <div data-testid="content" />
      </SidebarLayout>,
    );

    expect(contentWrapper()).toHaveClass('max-w-6xl');
  });

  it('relaxes the cap from 2xl up, so wide pages use the room', () => {
    render(
      <SidebarLayout navbar={<div />} sidebar={<div />}>
        <div data-testid="content" />
      </SidebarLayout>,
    );

    expect(contentWrapper()).toHaveClass('2xl:max-w-[100rem]');
  });

  it('offers its full height to pages that opt in', () => {
    // The wrapper is a flex column and its parent stretches it, so a page can
    // claim the panel height with flex-1. It used to be items-start, which
    // made that impossible however the page was written.
    render(
      <SidebarLayout navbar={<div />} sidebar={<div />}>
        <div data-testid="content" />
      </SidebarLayout>,
    );

    expect(contentWrapper()).toHaveClass('flex', 'flex-col');
    expect(contentWrapper()?.parentElement).toHaveClass('items-stretch');
  });
});
