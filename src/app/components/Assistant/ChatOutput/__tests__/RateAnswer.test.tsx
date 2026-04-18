import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { RateAnswer } from '../RateAnswer';

vi.mock('@/app/actions', () => ({
  rateMessage: vi.fn().mockResolvedValue({ success: true }),
}));

const messages = {
  'rate-answer': {
    'thank-you': 'Thank you',
    'try-again': 'Try again',
    like: 'Rate positively',
    dislike: 'Rate negatively',
  },
};

function renderRateAnswer(initialRated?: number | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RateAnswer messageId="msg-1" initialRated={initialRated} />
    </NextIntlClientProvider>,
  );
}

describe('RateAnswer', () => {
  it('renders like and dislike buttons when unrated', () => {
    renderRateAnswer(null);
    expect(screen.getByTestId('rate-like-btn')).toBeInTheDocument();
    expect(screen.getByTestId('rate-dislike-btn')).toBeInTheDocument();
  });

  it('like button has data-tooltip-id attribute', () => {
    renderRateAnswer(null);
    const btn = screen.getByTestId('rate-like-btn');
    expect(btn.closest('[data-tooltip-id]')).toBeTruthy();
  });

  it('dislike button has data-tooltip-id attribute', () => {
    renderRateAnswer(null);
    const btn = screen.getByTestId('rate-dislike-btn');
    expect(btn.closest('[data-tooltip-id]')).toBeTruthy();
  });
});
