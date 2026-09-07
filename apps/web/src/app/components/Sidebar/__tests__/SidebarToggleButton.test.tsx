import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SidebarToggleButton } from '../SidebarToggleButton';

vi.mock('@ragenai/common-ui/SidebarLayout', () => ({
  useSidebarCollapse: () => ({ toggle: vi.fn() }),
}));

const messages = {
  sidebar: {
    'toggle-sidebar': 'Przełącz pasek boczny',
  },
};

describe('SidebarToggleButton', () => {
  it('uses a localized aria-label instead of hardcoded English', () => {
    render(
      <NextIntlClientProvider locale="pl" messages={messages}>
        <SidebarToggleButton />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByRole('button', { name: 'Przełącz pasek boczny' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Toggle sidebar' }),
    ).not.toBeInTheDocument();
  });
});
