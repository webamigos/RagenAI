import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import { OptimizeTab } from '../OptimizeTab';
import messages from '@/app/messages/pl.json';

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
    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThan(1),
    );
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
});
