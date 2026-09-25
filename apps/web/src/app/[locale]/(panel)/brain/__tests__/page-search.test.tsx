import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import pl from '@/app/messages/pl.json';

const push = vi.fn();
vi.mock('@/i18n/routing', () => ({ useRouter: () => ({ push }) }));

const { PageSearch } = await import('../components/PageSearch');

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="pl" messages={pl}>
      {ui}
    </NextIntlClientProvider>,
  );

beforeEach(() => push.mockReset());

describe('PageSearch', () => {
  it('searches on Enter, keeping the status and the language it was typed under', () => {
    wrap(<PageSearch search={null} status="CANDIDATE" language="pol" />);
    const input = screen.getByTestId('brain-page-search');
    fireEvent.change(input, { target: { value: '  urlop ' } });
    fireEvent.submit(input.closest('form')!);
    expect(push).toHaveBeenCalledWith(
      '/brain?status=CANDIDATE&q=urlop&lang=pol',
    );
  });

  it('follows the address when it brings another search — Back, or a link', () => {
    const { rerender } = wrap(
      <PageSearch search="urlop" status={null} language={null} />,
    );
    fireEvent.change(screen.getByTestId('brain-page-search'), {
      target: { value: 'urlopy i' },
    });
    rerender(
      <NextIntlClientProvider locale="pl" messages={pl}>
        <PageSearch search="kadry" status={null} language={null} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId('brain-page-search')).toHaveValue('kadry');
    rerender(
      <NextIntlClientProvider locale="pl" messages={pl}>
        <PageSearch search={null} status={null} language={null} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId('brain-page-search')).toHaveValue('');
  });

  it('offers to clear only a search that is on, and clearing keeps the rest', () => {
    const { unmount } = wrap(
      <PageSearch search={null} status={null} language={null} />,
    );
    expect(screen.queryByTestId('brain-page-search-clear')).toBeNull();
    unmount();

    wrap(<PageSearch search="urlop" status={null} language="eng" />);
    expect(screen.getByTestId('brain-page-search')).toHaveValue('urlop');
    fireEvent.click(screen.getByTestId('brain-page-search-clear'));
    expect(push).toHaveBeenCalledWith('/brain?lang=eng');
  });
});
