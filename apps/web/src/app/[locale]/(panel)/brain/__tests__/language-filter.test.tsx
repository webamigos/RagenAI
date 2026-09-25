import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import pl from '@/app/messages/pl.json';

const push = vi.fn();
const search = vi.hoisted(() => ({ current: '' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search.current),
}));
vi.mock('@/i18n/routing', () => ({
  usePathname: () => '/brain/graph',
  useRouter: () => ({ push }),
}));

const { LanguageFilter } = await import('../components/LanguageFilter');

const languages = [
  { language: 'pol', documents: 9 },
  { language: 'eng', documents: 2 },
  { language: null, documents: 1 },
];

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="pl" messages={pl}>
      {ui}
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  push.mockReset();
  search.current = '';
});

describe('LanguageFilter', () => {
  it('offers every language the documents are in, named, with how many', () => {
    wrap(<LanguageFilter languages={languages} />);
    const select = screen.getByTestId('brain-language-filter');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Wszystkie języki',
      'polski (9)',
      'angielski (2)',
      'Nierozpoznany (1)',
    ]);
    expect(select).toHaveValue('');
  });

  it('is not there when there is nothing to choose between', () => {
    wrap(<LanguageFilter languages={[{ language: 'pol', documents: 3 }]} />);
    expect(screen.queryByTestId('brain-language-filter')).toBeNull();
  });

  it('keeps the view and drops what belonged to the old selection', () => {
    search.current = 'focus=p1&budget=300&selected=p2&page=3';
    wrap(<LanguageFilter languages={languages} />);
    fireEvent.change(screen.getByTestId('brain-language-filter'), {
      target: { value: 'eng' },
    });
    expect(push).toHaveBeenCalledWith(
      '/brain/graph?focus=p1&budget=300&lang=eng',
    );
  });

  it('shows the picked language, and goes back to all of them', () => {
    search.current = 'lang=none';
    wrap(<LanguageFilter languages={languages} />);
    const select = screen.getByTestId('brain-language-filter');
    expect(select).toHaveValue('none');
    fireEvent.change(select, { target: { value: '' } });
    expect(push).toHaveBeenCalledWith('/brain/graph');
  });
});
