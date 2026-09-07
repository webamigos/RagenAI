import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatButton } from '../ChatButton';

const mockCloseSidebar = vi.fn();

vi.mock('@ragenai/common-ui/SidebarLayout', () => ({
  useMobileSidebar: () => ({ closeSidebar: mockCloseSidebar }),
}));

vi.mock('@ragenai/tui/navbar', () => ({
  NavbarItem: ({
    children,
    onClick,
    href,
    ...props
  }: React.PropsWithChildren<{
    onClick?: () => void;
    href?: string;
    [key: string]: unknown;
  }>) => (
    <a href={href} onClick={onClick} data-testid="navbar-item" {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@ragenai/tui/sidebar', () => ({
  SidebarItem: ({
    children,
    onClick,
    href,
    ...props
  }: React.PropsWithChildren<{
    onClick?: () => void;
    href?: string;
    [key: string]: unknown;
  }>) => (
    <a href={href} onClick={onClick} data-testid="sidebar-item" {...props}>
      {children}
    </a>
  ),
}));

describe('ChatButton', () => {
  beforeEach(() => {
    mockCloseSidebar.mockClear();
  });

  it('renders as NavbarItem when variant is navbar', () => {
    render(<ChatButton variant="navbar">New chat</ChatButton>);
    expect(screen.getByTestId('navbar-item')).toBeInTheDocument();
  });

  it('renders as SidebarItem when variant is sidebar', () => {
    render(<ChatButton variant="sidebar">New chat</ChatButton>);
    expect(screen.getByTestId('sidebar-item')).toBeInTheDocument();
  });

  it('links to /new', () => {
    render(<ChatButton variant="sidebar">New chat</ChatButton>);
    expect(screen.getByTestId('sidebar-item')).toHaveAttribute('href', '/new');
  });

  it('calls closeSidebar on click', () => {
    render(<ChatButton variant="sidebar">New chat</ChatButton>);
    fireEvent.click(screen.getByTestId('sidebar-item'));
    expect(mockCloseSidebar).toHaveBeenCalledTimes(1);
  });

  it('renders children', () => {
    render(<ChatButton variant="sidebar">New chat</ChatButton>);
    expect(screen.getByText('New chat')).toBeInTheDocument();
  });
});
