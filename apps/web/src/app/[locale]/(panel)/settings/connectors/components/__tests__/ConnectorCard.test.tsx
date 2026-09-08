import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

vi.mock('../../actions', () => ({
  initiateConnection: vi.fn(),
  confirmConnection: vi.fn(),
  disconnectProvider: vi.fn(),
  toggleProvider: vi.fn(),
  registerApiKey: vi.fn(),
  registerCustomHeaderConnection: vi.fn(),
  testCustomHeaderConnection: vi.fn(),
}));
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ConnectorCard } from '../ConnectorCard';
import { OrgFeaturesProvider } from '@/context/OrgFeaturesContext';
import { DEFAULT_FEATURES } from '@/features/subscriptions/contracts/features.types';
import messages from '@/app/messages/en.json';
import type { PublicProviderDto } from '@/features/connectors/contracts/connector.types';

const t = messages['settings-page'].connectors;

const provider = {
  provider: 'SLACK',
  name: 'Slack',
  authType: 'oauth',
  scopes: [],
} as unknown as PublicProviderDto;

function renderCard(mcpConnectors: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OrgFeaturesProvider features={{ ...DEFAULT_FEATURES, mcpConnectors }}>
        <ConnectorCard provider={provider} connector={undefined} />
      </OrgFeaturesProvider>
    </NextIntlClientProvider>,
  );
}

describe('ConnectorCard', () => {
  it('offers Connect when the organization may use connectors', () => {
    renderCard(true);

    const button = screen.getByRole('button', { name: t.connect });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('title');
  });

  it('keeps the card visible but disables Connect when the flag is off', () => {
    // The demo tenant's case: both apps/web and apps/api already refuse the
    // write, so a live button only led to an OAuth popup that then failed.
    renderCard(false);

    const button = screen.getByRole('button', { name: t.connect });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', t['disabled-for-org']);
    expect(screen.getByText(t.providers.SLACK.name)).toBeInTheDocument();
  });
});
