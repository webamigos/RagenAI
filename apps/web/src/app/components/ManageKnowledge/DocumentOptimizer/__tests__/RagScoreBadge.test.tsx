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
    'score-tooltip':
      'RAG readiness: {score}/100. How well this document is structured for retrieval.',
    'badge-label': 'RAG {score}/100',
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

  // Green, amber and crimson are the document-state vocabulary; a low score in
  // crimson read as a failed ingest. One neutral colour, the scale in the label.
  it.each([85, 55, 20])(
    'renders %i in the same neutral colour, with its scale',
    (total) => {
      renderBadge({ ragScore: { total } });
      const badge = screen.getByTestId('rag-score-badge');
      expect(badge.textContent).toBe(`RAG ${total}/100`);
      expect(badge.className).toContain('bg-muted');
      expect(badge.className).not.toMatch(/ready|pending|crimson|destructive/);
    },
  );

  it('rounds the score to nearest integer', () => {
    renderBadge({ ragScore: { total: 72.7 } });
    const badge = screen.getByTestId('rag-score-badge');
    expect(badge.textContent).toContain('73');
  });
});
