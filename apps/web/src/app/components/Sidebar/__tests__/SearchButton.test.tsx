import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchButton } from '../SearchButton';

const mockOpenSearch = vi.fn();
const mockCloseSidebar = vi.fn();

vi.mock('@ragenai/common-ui/SidebarLayout', () => ({
  useMobileSidebar: () => ({ closeSidebar: mockCloseSidebar }),
}));

vi.mock('@/app/hooks/useSearchThreadsContext', () => ({
  useSearchThreads: () => ({ openSearch: mockOpenSearch }),
}));

vi.mock('@ragenai/tui/navbar', () => ({
  NavbarItem: ({
    children,
    onClick,
    ...props
  }: React.PropsWithChildren<{
    onClick?: () => void;
    [key: string]: unknown;
  }>) => (
    <button onClick={onClick} data-testid="navbar-item" {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@ragenai/common-ui/Sidebar', () => ({
  SidebarItem: ({
    children,
    onClick,
    ...props
  }: React.PropsWithChildren<{
    onClick?: () => void;
    [key: string]: unknown;
  }>) => (
    <button onClick={onClick} data-testid="sidebar-item" {...props}>
      {children}
    </button>
  ),
}));

describe('SearchButton', () => {
  beforeEach(() => {
    mockOpenSearch.mockClear();
    mockCloseSidebar.mockClear();
  });

  it('renders as NavbarItem when variant is navbar', () => {
    render(<SearchButton variant="navbar">Search</SearchButton>);
    expect(screen.getByTestId('navbar-item')).toBeInTheDocument();
  });

  it('renders as SidebarItem when variant is sidebar', () => {
    render(<SearchButton variant="sidebar">Search</SearchButton>);
    expect(screen.getByTestId('sidebar-item')).toBeInTheDocument();
  });

  it('calls openSearch and closeSidebar on click', () => {
    render(<SearchButton variant="sidebar">Search</SearchButton>);
    fireEvent.click(screen.getByTestId('sidebar-item'));
    expect(mockOpenSearch).toHaveBeenCalledTimes(1);
    expect(mockCloseSidebar).toHaveBeenCalledTimes(1);
  });

  it('renders children', () => {
    render(<SearchButton variant="sidebar">Search</SearchButton>);
    expect(screen.getByText('Search')).toBeInTheDocument();
  });
});
