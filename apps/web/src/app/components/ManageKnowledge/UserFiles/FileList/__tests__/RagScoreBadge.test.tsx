import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';

import { RagScoreBadge } from '../RagScoreBadge';
import messages from '@/app/messages/en.json';
import { OrgFeaturesProvider } from '@/context/OrgFeaturesContext';
import { DEFAULT_FEATURES } from '@/features/subscriptions/contracts/features.types';

function show(metadata: unknown, ragReadinessScore = true) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OrgFeaturesProvider
        features={{ ...DEFAULT_FEATURES, ragReadinessScore }}
      >
        <RagScoreBadge metadata={metadata} />
      </OrgFeaturesProvider>
    </NextIntlClientProvider>,
  );
}

describe('RagScoreBadge', () => {
  it('shows the stored score, rounded', () => {
    show({ ragScore: { total: 41.6 } });
    expect(screen.getByTestId('rag-score-badge')).toHaveTextContent('42');
  });

  it('shows nothing for a file with no score', () => {
    show({ ragScore: null });
    expect(screen.queryByTestId('rag-score-badge')).not.toBeInTheDocument();
  });

  // A score stored before an operator turned `ragReadinessScore` off is not
  // shown either: the list and the grid both render this component.
  it('shows nothing where scoring is turned off, even with a stored score', () => {
    show({ ragScore: { total: 74 } }, false);
    expect(screen.queryByTestId('rag-score-badge')).not.toBeInTheDocument();
  });
});
