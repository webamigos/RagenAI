import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

const mockRegisterCustomHeaderConnection = vi.fn();
const mockTestCustomHeaderConnection = vi.fn();

vi.mock('../../actions', () => ({
  initiateConnection: vi.fn(),
  confirmConnection: vi.fn(),
  disconnectProvider: vi.fn(),
  toggleProvider: vi.fn(),
  registerApiKey: vi.fn(),
  registerCustomHeaderConnection: (...args: unknown[]) =>
    mockRegisterCustomHeaderConnection(...args),
  testCustomHeaderConnection: (...args: unknown[]) =>
    mockTestCustomHeaderConnection(...args),
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

const woocommerceProvider = {
  provider: 'WOOCOMMERCE',
  name: 'WooCommerce',
  authType: 'api_key_custom_header',
  mcpServerUrl: '',
} as unknown as PublicProviderDto;

const openMercatoProvider = {
  provider: 'OPEN_MERCATO',
  name: 'Open Mercato',
  authType: 'api_key_custom_header',
  mcpServerUrl: '',
  singleTokenAuth: true,
} as unknown as PublicProviderDto;

function renderCard(mcpConnectors: boolean, providerDto = provider) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OrgFeaturesProvider features={{ ...DEFAULT_FEATURES, mcpConnectors }}>
        <ConnectorCard provider={providerDto} connector={undefined} />
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

describe('ConnectorCard custom-header auth', () => {
  it('shows the two-part consumer key/secret fields for WooCommerce', async () => {
    const user = userEvent.setup();
    renderCard(true, woocommerceProvider);

    await user.click(screen.getByRole('button', { name: t.connect }));

    expect(
      screen.getByText(t['custom-header-site-url-label']),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t['custom-header-consumer-key-label']),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t['custom-header-consumer-secret-label']),
    ).toBeInTheDocument();
    // The connect button stays disabled until all three fields are filled.
    // Two buttons now share the label: the card's own trigger (already
    // disabled-irrelevant, it opened the dialog) and the dialog's submit.
    const buttons = screen.getAllByRole('button', { name: t.connect });
    expect(buttons[buttons.length - 1]).toBeDisabled();
  });

  it('shows a single API-key field for a singleTokenAuth provider (Open Mercato) and omits the secret', async () => {
    const user = userEvent.setup();
    renderCard(true, openMercatoProvider);

    await user.click(screen.getByRole('button', { name: t.connect }));

    expect(
      screen.getByText(t['custom-header-instance-url-label']),
    ).toBeInTheDocument();
    expect(
      screen.getByText(t['custom-header-api-key-label']),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(t['custom-header-consumer-secret-label']),
    ).not.toBeInTheDocument();
  });

  it('submits only siteUrl + consumerKey (no consumerSecret) for a singleTokenAuth provider', async () => {
    mockRegisterCustomHeaderConnection.mockResolvedValue({
      id: 'conn-1',
      status: 'CONNECTED',
      connectedAt: new Date(),
    });
    const user = userEvent.setup();
    renderCard(true, openMercatoProvider);

    await user.click(screen.getByRole('button', { name: t.connect }));
    await user.type(
      screen.getByPlaceholderText('https://your-org.example.com'),
      'https://acme.example.com',
    );
    await user.type(screen.getByPlaceholderText('omk_...'), 'omk_abc123');

    const submitButtons = screen.getAllByRole('button', { name: t.connect });
    await user.click(submitButtons[submitButtons.length - 1]);

    expect(mockRegisterCustomHeaderConnection).toHaveBeenCalledWith(
      'OPEN_MERCATO',
      { siteUrl: 'https://acme.example.com', consumerKey: 'omk_abc123' },
    );
  });
});
