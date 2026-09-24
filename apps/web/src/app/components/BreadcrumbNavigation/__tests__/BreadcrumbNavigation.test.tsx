import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/app/hooks/useBreadcrumbs', () => ({
  useBreadcrumbs: () => [
    { label: 'Assistants', href: '/projects' },
    { label: 'Customer service', href: '/projects/p1' },
    { label: 'Conversation', current: true },
  ],
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    className,
  }: React.PropsWithChildren<{ href: string; className?: string }>) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { BreadcrumbNavigation } from '../BreadcrumbNavigation';

describe('BreadcrumbNavigation', () => {
  // At 375px the whole trail pushed the assistant selector off the chat
  // header. Below `sm` only the current crumb stays, and it truncates.
  it('hides the ancestors below the sm breakpoint', () => {
    render(<BreadcrumbNavigation threadId="t1" />);

    for (const label of ['Assistants', 'Customer service']) {
      expect(screen.getByText(label).parentElement).toHaveClass(
        'max-sm:hidden',
      );
    }
    expect(screen.getByText('Conversation').parentElement).not.toHaveClass(
      'max-sm:hidden',
    );
  });

  it('lets the current crumb truncate instead of pushing its neighbours', () => {
    render(<BreadcrumbNavigation threadId="t1" />);

    expect(screen.getByText('Conversation')).toHaveClass('truncate');
    expect(screen.getByRole('navigation')).toHaveClass('min-w-0');
  });
});
