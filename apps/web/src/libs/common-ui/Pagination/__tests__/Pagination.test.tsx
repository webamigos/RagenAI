import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

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

const {
  Pagination,
  PaginationPrevious,
  PaginationNext,
  PaginationList,
  PaginationPage,
  PaginationGap,
} = await import('../Pagination');

describe('Pagination', () => {
  it('names the navigation landmark', () => {
    render(<Pagination />);

    expect(
      screen.getByRole('navigation', { name: 'Page navigation' }),
    ).toBeInTheDocument();
  });

  it('lets the caller override the landmark name', () => {
    render(<Pagination aria-label="Document pages" />);

    expect(
      screen.getByRole('navigation', { name: 'Document pages' }),
    ).toBeInTheDocument();
  });
});

describe('PaginationPrevious and PaginationNext', () => {
  it('render a link when there is a page to go to', () => {
    render(
      <>
        <PaginationPrevious href="?page=1" />
        <PaginationNext href="?page=3" />
      </>,
    );

    expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute(
      'href',
      '?page=1',
    );
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute(
      'href',
      '?page=3',
    );
  });

  // The kit version rendered a disabled <button>. These are anchors now, and an
  // anchor with no href is still focusable and still announced as a link, so
  // the boundary states have to stop being links altogether.
  it('renders no link at the first and last page', () => {
    render(
      <>
        <PaginationPrevious href={null} />
        <PaginationNext href={null} />
      </>,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Previous page')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByLabelText('Next page')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

describe('PaginationPage', () => {
  it('marks only the current page with aria-current', () => {
    render(
      <PaginationList>
        <PaginationPage href="?page=1">1</PaginationPage>
        <PaginationPage href="?page=2" current>
          2
        </PaginationPage>
      </PaginationList>,
    );

    expect(screen.getByRole('link', { name: 'Page 1' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.getByRole('link', { name: 'Page 2' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

describe('PaginationGap', () => {
  it('is hidden from assistive technology', () => {
    const { container } = render(<PaginationGap />);

    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});
