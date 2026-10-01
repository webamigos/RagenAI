import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import en from '@/app/messages/en.json';

const reindexAction = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toastInfo = vi.hoisted(() => vi.fn());

vi.mock('../actions', () => ({
  reindexForContextAction: () => reindexAction(),
}));
vi.mock('@/i18n/routing', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError, info: toastInfo },
}));

import { ContextualChunksSection } from '../components/ContextualChunksSection';
import type { ContextualChunksPageData } from '../actions';

function renderSection(data: ContextualChunksPageData) {
  return render(
    <NextIntlClientProvider messages={en} locale="en">
      <ContextualChunksSection data={data} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('ContextualChunksSection', () => {
  it('shows how many documents carry context, and offers the rest', () => {
    renderSection({
      enabled: true,
      status: { indexed: 28, stale: 28, reindexing: 0 },
    });
    expect(
      screen.getByText('0 of 28 documents indexed with context'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Re-index 28 documents' }),
    ).toBeInTheDocument();
  });

  it('offers nothing when every document is up to date', () => {
    renderSection({
      enabled: true,
      status: { indexed: 3, stale: 0, reindexing: 0 },
    });
    expect(
      screen.getByText('3 of 3 documents indexed with context'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('explains instead of offering a re-index while the key is off', () => {
    renderSection({
      enabled: false,
      status: { indexed: 3, stale: 3, reindexing: 0 },
    });
    expect(screen.getByText(/Contextual chunks are off/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says when the index could not be read', () => {
    renderSection({ enabled: true, status: null });
    expect(screen.getByText(/Couldn't read the index/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('re-indexes after confirming, then refreshes the counts', async () => {
    reindexAction.mockResolvedValue({ started: 2, failed: 0 });
    renderSection({
      enabled: true,
      status: { indexed: 2, stale: 2, reindexing: 0 },
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Re-index 2 documents' }),
    );
    expect(reindexAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Re-index' }));

    await waitFor(() => expect(reindexAction).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        'Re-indexing 2 documents in the background.',
      ),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it('says how many could not be started', async () => {
    reindexAction.mockResolvedValue({ started: 1, failed: 1 });
    renderSection({
      enabled: true,
      status: { indexed: 2, stale: 2, reindexing: 0 },
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Re-index 2 documents' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Re-index' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "1 document couldn't be started; 1 started. Try again in a few minutes.",
      ),
    );
  });

  it('counts documents already being processed apart, and does not offer them', () => {
    renderSection({
      enabled: true,
      status: { indexed: 10, stale: 0, reindexing: 4 },
    });
    expect(
      screen.getByText('6 of 10 documents indexed with context'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '4 documents are being processed now and will carry context when done.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('says so when every document was already being processed', async () => {
    reindexAction.mockResolvedValue({ started: 0, failed: 0, skipped: 2 });
    renderSection({
      enabled: true,
      status: { indexed: 2, stale: 2, reindexing: 0 },
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Re-index 2 documents' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Re-index' }));

    await waitFor(() =>
      expect(toastInfo).toHaveBeenCalledWith(
        'Nothing to re-index: those documents are already being processed.',
      ),
    );
  });
});
