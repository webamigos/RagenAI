import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import { FileSearch } from '../FileSearch';

const messages = {
  'files-table': { 'search-placeholder': 'Search files' },
};

const renderSearch = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FileSearch value="" onChange={vi.fn()} />
    </NextIntlClientProvider>,
  );

/**
 * Two inputs render — an expanding one below `md` and a plain one from `md`
 * up — and CSS decides which is visible, so both are in jsdom's tree.
 */
describe('FileSearch', () => {
  /**
   * The desktop field fills the box the toolbar gives it. It used to carry a
   * fixed `w-72` of its own, which no toolbar could shrink, and on a 14"
   * laptop with the app sidebar open that pushed the last filter chip onto a
   * second line.
   */
  it('fills the width its toolbar gives it instead of fixing its own', () => {
    renderSearch();

    const inputs = screen.getAllByPlaceholderText('Search files');
    const desktop = inputs[inputs.length - 1];

    expect(desktop).toHaveClass('w-full');
    expect(desktop).not.toHaveClass('w-72');
  });
});
