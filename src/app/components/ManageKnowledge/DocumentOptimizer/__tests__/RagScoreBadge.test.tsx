import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { RagScoreBadge } from '../../UserFiles/FileList/RagScoreBadge';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

const messages = {
  'document-optimizer': {
    'score-label': 'RAG Score',
  },
};

function renderBadge(metadata?: unknown) {
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <RagScoreBadge metadata={metadata} />
    </NextIntlClientProvider>,
  );
}

describe('RagScoreBadge', () => {
  it('renders nothing when metadata is undefined', () => {
    const { container } = renderBadge(undefined);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when metadata has no ragScore', () => {
    const { container } = renderBadge({ suspicious: true });
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when ragScore.total is not a number', () => {
    const { container } = renderBadge({ ragScore: { total: 'high' } });
    expect(container.innerHTML).toBe('');
  });

  it('renders green badge for score >= 70', () => {
    renderBadge({ ragScore: { total: 85 } });
    const badge = screen.getByTestId('rag-score-badge');
    expect(badge.textContent).toBe('RAG: 85');
    expect(badge.className).toContain('bg-green-100');
  });

  it('renders amber badge for score 40-69', () => {
    renderBadge({ ragScore: { total: 55 } });
    const badge = screen.getByTestId('rag-score-badge');
    expect(badge.textContent).toBe('RAG: 55');
    expect(badge.className).toContain('bg-amber-100');
  });

  it('renders red badge for score < 40', () => {
    renderBadge({ ragScore: { total: 20 } });
    const badge = screen.getByTestId('rag-score-badge');
    expect(badge.textContent).toBe('RAG: 20');
    expect(badge.className).toContain('bg-red-100');
  });

  it('rounds the score to nearest integer', () => {
    renderBadge({ ragScore: { total: 72.7 } });
    const badge = screen.getByTestId('rag-score-badge');
    expect(badge.textContent).toBe('RAG: 73');
  });
});
