import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import { StartFromSuggestions } from '../StartFromSuggestions';
import messages from '@/app/messages/en.json';

const renderCards = (onSelect = vi.fn(), hidden?: boolean) => {
  const utils = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <StartFromSuggestions onSelect={onSelect} hidden={hidden} />
    </NextIntlClientProvider>,
  );
  return { onSelect, ...utils };
};

describe('StartFromSuggestions', () => {
  it('offers exactly four ways in', () => {
    renderCards();

    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('is one line per chip — the title, with the prompt as its tooltip', () => {
    // Secondary to the composer: the prompt is not printed on the chip, but it
    // is still discoverable before clicking.
    renderCards();

    const chip = screen.getByRole('button', { name: 'Summarize a document' });
    expect(chip).toHaveTextContent(/^Summarize a document$/);
    expect(chip).toHaveAttribute(
      'title',
      'Summarize [document name] and list the key takeaways.',
    );
  });

  it('hands back the prompt it describes', async () => {
    const { onSelect } = renderCards();

    await userEvent.click(
      screen.getByRole('button', { name: 'Explain a concept' }),
    );

    expect(onSelect).toHaveBeenCalledWith(
      'Explain [topic] in simple terms, based on our documentation.',
    );
  });

  it('every prompt leaves a placeholder for the reader to fill', () => {
    // The chips are examples, and an example that is complete gets sent as-is.
    // If a future edit removes the brackets, that is a copy decision worth
    // making on purpose rather than by accident.
    renderCards();

    for (const chip of screen.getAllByRole('button')) {
      expect(chip.getAttribute('title')).toMatch(/\[[^\]]+\]/);
    }
  });

  it('is a labelled region, not a loose row of buttons', () => {
    renderCards();

    expect(
      screen.getByRole('region', { name: 'Start from' }),
    ).toBeInTheDocument();
  });

  it('hidden stays mounted, keeps its space, and leaves the tab order', () => {
    const { container } = renderCards(vi.fn(), true);

    const section = container.querySelector('section');
    expect(section).not.toBeNull();
    // `invisible` (visibility: hidden) reserves the row's height; `hidden` or
    // `display: none` would not, and the composer above would move.
    expect(section).toHaveClass('invisible', 'opacity-0');
    expect(section).not.toHaveClass('hidden');
    expect(section).toHaveAttribute('inert');
    expect(section).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(container.querySelectorAll('button')).toHaveLength(4);
  });

  it('respects reduced motion — the fade is motion-safe only', () => {
    const { container } = renderCards();

    const section = container.querySelector('section');
    expect(section?.className).toMatch(/motion-safe:transition-/);
    expect(section?.className).not.toMatch(/(^|\s)transition-/);
  });
});
