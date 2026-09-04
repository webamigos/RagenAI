import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { LocaleSwitcher } from '../LocaleSwitcher';

const replace = vi.fn();

vi.mock('@/i18n/routing', () => ({
  usePathname: () => '/settings/general',
  useRouter: () => ({ replace }),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useParams: () => ({}),
}));

function renderSwitcher(locale = 'en') {
  return render(
    <NextIntlClientProvider messages={{}} locale={locale}>
      <LocaleSwitcher />
    </NextIntlClientProvider>,
  );
}

describe('LocaleSwitcher', () => {
  beforeEach(() => {
    replace.mockClear();
  });

  it('shows the current locale as the selected option', () => {
    renderSwitcher('en');
    expect(screen.getByText('English')).toBeInTheDocument();
  });

  it('lists every supported locale by its native name once opened', async () => {
    const user = userEvent.setup();
    renderSwitcher('en');

    await user.click(screen.getByRole('button'));

    expect(screen.getByRole('option', { name: 'Polski' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Español' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Deutsch' })).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Français' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Português' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Italiano' }),
    ).toBeInTheDocument();
  });

  it('navigates to the same pathname under the newly selected locale', async () => {
    const user = userEvent.setup();
    renderSwitcher('en');

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('option', { name: 'Deutsch' }));

    expect(replace).toHaveBeenCalledWith(
      { pathname: '/settings/general', params: {} },
      { locale: 'de' },
    );
  });
});
