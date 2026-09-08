import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

const saveOrgConnectorsAction = vi.hoisted(() => vi.fn());

vi.mock('../actions', () => ({ saveOrgConnectorsAction }));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { OrgConnectorsView } from '../OrgConnectorsView';
import { OrgFeaturesProvider } from '@/context/OrgFeaturesContext';
import { DEFAULT_FEATURES } from '@/features/subscriptions/contracts/features.types';
import messages from '@/app/messages/en.json';

const t = messages['organization-page'].connectors;

const available = [
  { provider: 'SLACK', name: 'Slack', icon: '/assets/connectors/slack.svg' },
];

function renderView(manageOrganizationSettings: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OrgFeaturesProvider
        features={{ ...DEFAULT_FEATURES, manageOrganizationSettings }}
      >
        <OrgConnectorsView available={available} orgEnabled={[]} />
      </OrgFeaturesProvider>
    </NextIntlClientProvider>,
  );
}

describe('OrgConnectorsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveOrgConnectorsAction.mockResolvedValue({ success: true });
  });

  it('saves a toggle when the organization may change its settings', async () => {
    const user = userEvent.setup();
    renderView(true);

    await user.click(screen.getByRole('checkbox', { name: 'Slack' }));

    expect(saveOrgConnectorsAction).toHaveBeenCalledWith(['SLACK']);
    expect(screen.getByText(t.hint)).toBeInTheDocument();
  });

  it('shows the list read-only when settings are frozen', async () => {
    // The demo tenant: `saveAllowedConnectors` would refuse anyway, so the
    // checkbox is disabled instead of failing after a click and snapping back.
    const user = userEvent.setup();
    renderView(false);

    const checkbox = screen.getByRole('checkbox', { name: 'Slack' });
    expect(checkbox).toBeDisabled();
    await user.click(checkbox);

    expect(saveOrgConnectorsAction).not.toHaveBeenCalled();
    expect(screen.getByText(t['read-only'])).toBeInTheDocument();
    expect(screen.queryByText(t.hint)).not.toBeInTheDocument();
  });
});
