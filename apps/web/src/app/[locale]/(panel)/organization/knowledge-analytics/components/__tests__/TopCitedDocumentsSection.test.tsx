import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

vi.mock('recharts', () => ({
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Pie: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Cell: () => <div data-testid="cell" />,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { TopCitedDocumentsSection } from '../TopCitedDocumentsSection';

const messages = {
  'settings-page': {
    'knowledge-analytics': {
      'top-cited': {
        title: 'Top 10 Cited Documents',
        empty: 'No citation data yet.',
        'chart-empty': 'No citations yet',
        'chart-total-citations': 'citations',
        'col-document': 'Document',
        'col-citations': 'Citations',
        'col-rating': 'Rating',
        'rating-none': 'No ratings yet',
        export: 'Export CSV',
      },
    },
  },
};

const items = [
  {
    fileId: 'f1',
    publicId: 'f1',
    fileName: 'Doc Alpha',
    citationCount: 10,
    positiveCount: 3,
    negativeCount: 1,
    positiveRatePct: 75,
  },
  {
    fileId: 'f2',
    publicId: 'f2',
    fileName: 'Doc Beta',
    citationCount: 5,
    positiveCount: 0,
    negativeCount: 0,
    positiveRatePct: null,
  },
];

function wrap(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('TopCitedDocumentsSection', () => {
  it('renders section title', () => {
    wrap(<TopCitedDocumentsSection items={items} isLoading={false} />);
    expect(screen.getByText('Top 10 Cited Documents')).toBeInTheDocument();
  });

  it('renders all document rows', () => {
    wrap(<TopCitedDocumentsSection items={items} isLoading={false} />);
    expect(screen.getByText('Doc Alpha')).toBeInTheDocument();
    expect(screen.getByText('Doc Beta')).toBeInTheDocument();
  });

  it('shows empty state when no items', () => {
    wrap(<TopCitedDocumentsSection items={[]} isLoading={false} />);
    expect(screen.getByText('No citation data yet.')).toBeInTheDocument();
  });

  it('shows total citations as center label', () => {
    wrap(<TopCitedDocumentsSection items={items} isLoading={false} />);
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('shows the thumbs counts for a rated document', () => {
    wrap(<TopCitedDocumentsSection items={items} isLoading={false} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows a dash, not 0%, for a document nobody rated', () => {
    wrap(<TopCitedDocumentsSection items={items} isLoading={false} />);

    // "Nobody rated the answers citing this" and "everybody disliked them"
    // are opposite findings; 0% would render them identically.
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });
});
