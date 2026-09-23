import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getTranslations:
    async () => (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { BrainPager } = await import('../components/BrainPager');
const { BRAIN_LIST_LIMIT } = await import('@/features/brain/constants');

const hrefFor = (n: number) => `/brain?page=${n}`;
const show = async (page: number, total: number) => {
  const ui = await BrainPager({ page, total, hrefFor });
  return render(<>{ui}</>);
};

describe('BrainPager', () => {
  it('renders nothing when everything fits on one batch', async () => {
    const { container } = await show(1, BRAIN_LIST_LIMIT);
    expect(container).toBeEmptyDOMElement();
  });

  it('links both ways from a middle batch', async () => {
    await show(2, BRAIN_LIST_LIMIT * 3);
    expect(screen.getByRole('link', { name: 'previous' })).toHaveAttribute(
      'href',
      '/brain?page=1',
    );
    expect(screen.getByRole('link', { name: 'next' })).toHaveAttribute(
      'href',
      '/brain?page=3',
    );
  });

  it('goes straight back to the last batch from a page past the end', async () => {
    await show(9, BRAIN_LIST_LIMIT * 2);
    expect(screen.getByRole('link', { name: 'previous' })).toHaveAttribute(
      'href',
      '/brain?page=2',
    );
    expect(screen.queryByRole('link', { name: 'next' })).toBeNull();
  });

  it('offers a way back even when the whole list now fits on one batch', async () => {
    await show(4, 3);
    expect(screen.getByRole('link', { name: 'previous' })).toHaveAttribute(
      'href',
      '/brain?page=1',
    );
  });
});
