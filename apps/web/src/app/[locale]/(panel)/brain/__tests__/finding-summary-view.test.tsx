import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';

import pl from '@/app/messages/pl.json';

vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: 'pl', messages: pl, namespace } as never),
  getFormatter: async () => ({ dateTime: (d: Date) => d.toISOString() }),
}));

import { FindingSummaryView } from '../components/FindingSummaryView';

const REASON =
  'the run reached its limit (200 documents, 400000 tokens) before this document — extract it again';

describe('FindingSummaryView — an extraction failure', () => {
  // The worker's reason is English on every locale. It followed the Polish
  // sentence in brackets; now the sentence stands alone and the reason is
  // one click away, for the retry decision or the support ticket.
  it('says it in the reader’s language and folds the worker’s reason away', async () => {
    render(
      await FindingSummaryView({
        summary: { kind: 'extraction_failed', reason: REASON },
      }),
    );

    expect(
      screen.getByText(pl.brain.findings.summary['extraction-failed']),
    ).toBeInTheDocument();
    const reason = screen.getByText(REASON);
    expect(reason.closest('details')).not.toBeNull();
    expect(reason.closest('details')).not.toHaveAttribute('open');
    expect(screen.getByText('Szczegóły techniczne')).toBeInTheDocument();
  });

  it('shows no disclosure when the worker gave no reason', async () => {
    const { container } = render(
      await FindingSummaryView({
        summary: { kind: 'extraction_failed', reason: null },
      }),
    );

    expect(container.querySelector('details')).toBeNull();
  });
});
