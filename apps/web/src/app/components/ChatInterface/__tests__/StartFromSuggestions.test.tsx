import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import { StartFromSuggestions } from '../StartFromSuggestions';
import messages from '@/app/messages/en.json';

const renderCards = (onSelect = vi.fn()) => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <StartFromSuggestions onSelect={onSelect} />
    </NextIntlClientProvider>,
  );
  return onSelect;
};

describe('StartFromSuggestions', () => {
  it('offers exactly four ways in', () => {
    renderCards();

    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('shows the prompt as well as the title, so the card is not a guess', () => {
    renderCards();

    const card = screen.getByRole('button', { name: /Summarize a document/ });
    expect(card).toHaveTextContent('Summarize a document');
    expect(card).toHaveTextContent(
      'Summarize [document name] and list the key takeaways.',
    );
  });

  it('hands back the prompt it displayed', async () => {
    const onSelect = renderCards();

    await userEvent.click(
      screen.getByRole('button', { name: /Explain a concept/ }),
    );

    expect(onSelect).toHaveBeenCalledWith(
      'Explain [topic] in simple terms, based on our documentation.',
    );
  });

  it('every prompt leaves a placeholder for the reader to fill', () => {
    // The cards are examples, and an example that is complete gets sent as-is.
    // If a future edit removes the brackets, that is a copy decision worth
    // making on purpose rather than by accident.
    renderCards();

    for (const card of screen.getAllByRole('button')) {
      expect(card.textContent).toMatch(/\[[^\]]+\]/);
    }
  });

  it('is a labelled region, not a loose row of buttons', () => {
    renderCards();

    expect(
      screen.getByRole('region', { name: 'Start from' }),
    ).toBeInTheDocument();
  });
});
