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

import {
  UnusedDocumentsSection,
  computeBuckets,
} from '../UnusedDocumentsSection';

const messages = {
  'settings-page': {
    'knowledge-analytics': {
      'unused-docs': {
        title: 'Unused Documents',
        empty: 'All docs cited.',
        'chart-empty': 'No unused documents',
        'chart-total-unused': 'unused',
        'range-90-180': '90–180 days',
        'range-180-365': '180–365 days',
        'range-365-plus': '365+ days',
        'col-document': 'Document',
        'col-last-cited': 'Last Cited',
        'col-days': 'Days Unused',
        export: 'Export CSV',
      },
    },
  },
};

function wrap(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe('computeBuckets', () => {
  it('assigns 90 days to range-90-180', () => {
    expect(computeBuckets([{ daysSinceUsed: 90 }])).toEqual([
      { key: 'range-90-180', count: 1 },
      { key: 'range-180-365', count: 0 },
      { key: 'range-365-plus', count: 0 },
    ]);
  });

  it('assigns 179 days to range-90-180', () => {
    expect(computeBuckets([{ daysSinceUsed: 179 }])).toEqual([
      { key: 'range-90-180', count: 1 },
      { key: 'range-180-365', count: 0 },
      { key: 'range-365-plus', count: 0 },
    ]);
  });

  it('assigns 180 days to range-180-365', () => {
    expect(computeBuckets([{ daysSinceUsed: 180 }])).toEqual([
      { key: 'range-90-180', count: 0 },
      { key: 'range-180-365', count: 1 },
      { key: 'range-365-plus', count: 0 },
    ]);
  });

  it('assigns 364 days to range-180-365', () => {
    expect(computeBuckets([{ daysSinceUsed: 364 }])).toEqual([
      { key: 'range-90-180', count: 0 },
      { key: 'range-180-365', count: 1 },
      { key: 'range-365-plus', count: 0 },
    ]);
  });

  it('assigns 365 days to range-365-plus', () => {
    expect(computeBuckets([{ daysSinceUsed: 365 }])).toEqual([
      { key: 'range-90-180', count: 0 },
      { key: 'range-180-365', count: 0 },
      { key: 'range-365-plus', count: 1 },
    ]);
  });

  it('counts multiple items across buckets', () => {
    const items = [
      { daysSinceUsed: 100 },
      { daysSinceUsed: 200 },
      { daysSinceUsed: 400 },
      { daysSinceUsed: 150 },
    ];
    expect(computeBuckets(items)).toEqual([
      { key: 'range-90-180', count: 2 },
      { key: 'range-180-365', count: 1 },
      { key: 'range-365-plus', count: 1 },
    ]);
  });
});

describe('UnusedDocumentsSection', () => {
  it('renders section title', () => {
    wrap(
      <UnusedDocumentsSection
        items={[
          {
            fileId: 'f1',
            publicId: 'f1',
            fileName: 'Old Doc',
            lastCitedAt: null,
            daysSinceUsed: 100,
          },
        ]}
        isLoading={false}
      />,
    );
    expect(screen.getByText('Unused Documents')).toBeInTheDocument();
  });

  it('shows empty state when no items', () => {
    wrap(<UnusedDocumentsSection items={[]} isLoading={false} />);
    expect(screen.getByText('All docs cited.')).toBeInTheDocument();
  });
});
