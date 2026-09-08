import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

vi.mock('../ConnectorCard', () => ({
  ConnectorCard: () => <div data-testid="connector-card" />,
}));

import { ConnectorsList } from '../ConnectorsList';
import { OrgFeaturesProvider } from '@/context/OrgFeaturesContext';
import { DEFAULT_FEATURES } from '@/features/subscriptions/contracts/features.types';
import messages from '@/app/messages/en.json';

const t = messages['settings-page'].connectors;

function renderList(mcpConnectors: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OrgFeaturesProvider features={{ ...DEFAULT_FEATURES, mcpConnectors }}>
        <ConnectorsList providers={[]} connectors={[]} />
      </OrgFeaturesProvider>
    </NextIntlClientProvider>,
  );
}

describe('ConnectorsList', () => {
  it('says nothing extra when connectors are allowed', () => {
    renderList(true);

    expect(screen.queryByText(t['disabled-for-org'])).not.toBeInTheDocument();
  });

  it('explains why every Connect button is disabled when they are not', () => {
    renderList(false);

    expect(screen.getByText(t['disabled-for-org'])).toBeInTheDocument();
  });
});
