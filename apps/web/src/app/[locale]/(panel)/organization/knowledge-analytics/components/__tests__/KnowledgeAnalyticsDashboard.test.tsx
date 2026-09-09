import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

const getKnowledgeAnalyticsDashboard = vi.fn();

vi.mock('@/app/actions/knowledge-analytics', () => ({
  getKnowledgeAnalyticsDashboard: () => getKnowledgeAnalyticsDashboard(),
}));

// The sections have their own tests; this one is about the page frame.
vi.mock('../KnowledgeAnalyticsSummaryCards', () => ({
  KnowledgeAnalyticsSummaryCards: () => <div data-testid="summary" />,
}));
vi.mock('../DailyQuestionsChart', () => ({
  DailyQuestionsChart: () => <div data-testid="daily" />,
}));
vi.mock('../TopCitedDocumentsSection', () => ({
  TopCitedDocumentsSection: () => <div data-testid="top-cited" />,
}));
vi.mock('../UnusedDocumentsSection', () => ({
  UnusedDocumentsSection: () => <div data-testid="unused" />,
}));
vi.mock('../NegativeQaTable', () => ({
  NegativeQaTable: () => <div data-testid="negative-qa" />,
}));

import { KnowledgeAnalyticsDashboard } from '../KnowledgeAnalyticsDashboard';

const API_EXCLUDED = 'Questions sent through the public API are not counted.';

const messages = {
  'settings-page': {
    'knowledge-analytics': {
      title: 'Knowledge Analytics',
      description: 'Insights into how your knowledge base is being used.',
      'api-excluded': API_EXCLUDED,
      error: 'Failed to load analytics data. Please try again.',
      'error-title': 'Failed to load analytics',
      retry: 'Try again',
      refresh: 'Refresh data',
    },
  },
};

const data = {
  summary: { totalQuestions: 0, uniqueUsers: 0, positiveRatePct: 0 },
  dailyQuestions: [],
  topCited: [],
  unusedDocs: [],
  negativeQa: { items: [], total: 0 },
};

function wrap() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <KnowledgeAnalyticsDashboard />
    </NextIntlClientProvider>,
  );
}

describe('KnowledgeAnalyticsDashboard', () => {
  /**
   * The queries behind this page exclude `Source.API` threads. An exclusion
   * leaves nothing on screen to see, so someone comparing these numbers
   * against their own API dashboard has no way to tell which of the two is
   * wrong. The line is the only place that scope is stated to a reader.
   */
  it('states that API traffic is not counted', async () => {
    getKnowledgeAnalyticsDashboard.mockResolvedValue(data);

    wrap();

    expect(await screen.findByText(API_EXCLUDED)).toBeInTheDocument();
  });

  it('shows the scope beside the numbers, not only while they load', async () => {
    getKnowledgeAnalyticsDashboard.mockResolvedValue(data);

    wrap();

    await screen.findByTestId('summary');
    expect(screen.getByText(API_EXCLUDED)).toBeInTheDocument();
  });

  it('does not claim a scope when the load failed', async () => {
    getKnowledgeAnalyticsDashboard.mockRejectedValue(new Error('nope'));

    wrap();

    // The error state replaces the header, so nothing should imply the
    // numbers behind it were filtered — there are no numbers.
    expect(
      await screen.findByText('Failed to load analytics'),
    ).toBeInTheDocument();
    expect(screen.queryByText(API_EXCLUDED)).not.toBeInTheDocument();
  });
});
