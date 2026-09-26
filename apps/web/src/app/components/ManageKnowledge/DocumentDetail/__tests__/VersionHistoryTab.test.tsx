import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import { VersionHistoryTab } from '../VersionHistoryTab';
import messages from '@/app/messages/en.json';
import { OrgFeaturesProvider } from '@/context/OrgFeaturesContext';
import { DEFAULT_FEATURES } from '@/features/subscriptions/contracts/features.types';

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const version = (versionNumber: number, total: number | null) => ({
  id: `v-${versionNumber}`,
  versionNumber,
  changeType: 'UPLOAD',
  authorId: null,
  authorName: null,
  comment: null,
  ragScore: total === null ? null : { total },
  isActive: versionNumber === 2,
  createdAt: new Date(0).toISOString(),
});

const noScore = messages['document-versions']['no-score'];

function show(ragReadinessScore: boolean) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OrgFeaturesProvider
        features={{ ...DEFAULT_FEATURES, ragReadinessScore }}
      >
        <VersionHistoryTab documentId="doc-1" />
      </OrgFeaturesProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ versions: [version(2, 74), version(1, null)] }),
          { status: 200 },
        ),
      ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('VersionHistoryTab — scores', () => {
  it('shows each version’s score, or that it has none', async () => {
    show(true);

    expect(await screen.findByTestId('document-version-2')).toHaveTextContent(
      '74/100',
    );
    expect(screen.getByTestId('document-version-1')).toHaveTextContent(noScore);
  });

  // `ragReadinessScore` off: no score and no "no score" either, since the
  // absence is the setting, not something about the version.
  it('shows neither where scoring is turned off', async () => {
    show(false);

    const latest = await screen.findByTestId('document-version-2');
    expect(latest).not.toHaveTextContent('74/100');
    expect(screen.getByTestId('document-version-1')).not.toHaveTextContent(
      noScore,
    );
  });
});
