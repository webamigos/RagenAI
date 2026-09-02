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
