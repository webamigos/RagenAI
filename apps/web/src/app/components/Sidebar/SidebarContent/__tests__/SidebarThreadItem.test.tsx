import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SidebarThreadItem } from '../SidebarThreadItem';

vi.mock('@ragenai/tui/sidebar-layout', () => ({
  useMobileSidebar: () => ({ closeSidebar: vi.fn() }),
}));

vi.mock('@ragenai/tui/sidebar', () => ({
  SidebarItem: ({
    children,
    href,
    current,
    onClick,
    ...props
  }: React.PropsWithChildren<{
    href?: string;
    current?: boolean;
    onClick?: () => void;
    [key: string]: unknown;
  }>) => (
    <a href={href} data-current={current} onClick={onClick} {...props}>
      {children}
    </a>
  ),
  SidebarLabel: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <span {...props}>{children}</span>
  ),
}));

vi.mock('@/app/components/ThreadDropdownMenu', () => ({
  ThreadDropdownMenu: () => <div data-testid="thread-dropdown" />,
}));

const mockThread = {
  id: 'thread-1',
  title: 'My Thread',
  isStarred: false,
  createdAt: '2026-01-01T00:00:00Z',
  projectId: null,
  teamId: null,
  project: null,
  team: null,
};

describe('SidebarThreadItem', () => {
  it('renders thread title', () => {
    render(
      <SidebarThreadItem
        thread={mockThread}
        isActive={false}
        onToggleStar={vi.fn()}
      />,
    );
    expect(screen.getByText('My Thread')).toBeInTheDocument();
  });

  it('shows fallback title when thread has no title', () => {
    render(
      <SidebarThreadItem
        thread={{ ...mockThread, title: '' }}
        isActive={false}
        onToggleStar={vi.fn()}
      />,
    );
    expect(screen.getByText('New conversation')).toBeInTheDocument();
  });

  it('links to correct thread href', () => {
    render(
      <SidebarThreadItem
        thread={mockThread}
        isActive={false}
        onToggleStar={vi.fn()}
      />,
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/chats/thread-1');
  });

  it('marks link as current when active', () => {
    render(
      <SidebarThreadItem
        thread={mockThread}
        isActive={true}
        onToggleStar={vi.fn()}
      />,
    );
    expect(screen.getByRole('link')).toHaveAttribute('data-current', 'true');
  });

  it('renders dropdown menu', () => {
    render(
      <SidebarThreadItem
        thread={mockThread}
        isActive={false}
        onToggleStar={vi.fn()}
      />,
    );
    expect(screen.getByTestId('thread-dropdown')).toBeInTheDocument();
  });

  it('has aria-label with thread title', () => {
    render(
      <SidebarThreadItem
        thread={mockThread}
        isActive={false}
        onToggleStar={vi.fn()}
      />,
    );
    expect(screen.getByRole('link')).toHaveAttribute(
      'aria-label',
      'Thread: My Thread',
    );
  });
});
