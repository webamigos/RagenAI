import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import { OptimizeTab } from '../OptimizeTab';
import messages from '@/app/messages/pl.json';
import { OrgFeaturesProvider } from '@/context/OrgFeaturesContext';
import { DEFAULT_FEATURES } from '@/features/subscriptions/contracts/features.types';

const job = (status: string) => ({
  job: {
    id: 'job-1',
    status,
    baseScore: 60,
    suggestions: [],
    startedAt: new Date(0).toISOString(),
  },
  fileRagScore: 60,
});

let fetchMock: ReturnType<typeof vi.fn>;

const renderTab = () =>
  render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <OptimizeTab documentId="doc-1" fileType="MARKDOWN" />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('OptimizeTab', () => {
  it('keeps polling when the job it finds on mount is still running', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(job('processing')), { status: 200 }),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderTab();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // The regression: fetchJob only ever *stopped* polling, so reloading the
    // page mid-run left the spinner up and nothing ever asked the server again.
    await vi.advanceTimersByTimeAsync(4_000);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(1));
  });

  it('does not poll a job that has already finished', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(job('done')), { status: 200 }),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });

    renderTab();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(12_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('says so instead of offering the button for an unsupported file type', () => {
    renderTab();
    const { unmount } = render(
      <NextIntlClientProvider locale="pl" messages={messages}>
        <OptimizeTab documentId="doc-1" fileType="XLSX" />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByText(messages['document-optimize']['unsupported-file-type']),
    ).toBeInTheDocument();
    unmount();
  });

  describe('the current score', () => {
    const currentScore = messages['document-optimize']['current-score'];

    const renderWithScoring = (ragReadinessScore: boolean) =>
      render(
        <NextIntlClientProvider locale="pl" messages={messages}>
          <OrgFeaturesProvider
            features={{ ...DEFAULT_FEATURES, ragReadinessScore }}
          >
            <OptimizeTab documentId="doc-1" fileType="MARKDOWN" />
          </OrgFeaturesProvider>
        </NextIntlClientProvider>,
      );

    it('is shown beside a finished analysis', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify(job('done')), { status: 200 }),
      );
      renderWithScoring(true);

      expect(
        await screen.findByText(currentScore, { exact: false }),
      ).toBeInTheDocument();
    });

    // Optimize still works with `ragReadinessScore` off; it shows no number.
    it('is not shown where scoring is turned off', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify(job('done')), { status: 200 }),
      );
      renderWithScoring(false);

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(
        await screen.findByText(
          messages['document-optimize']['no-suggestions'],
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(currentScore, { exact: false }),
      ).not.toBeInTheDocument();
    });
  });
});
