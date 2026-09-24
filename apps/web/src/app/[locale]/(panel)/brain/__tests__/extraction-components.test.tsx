import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '@/app/messages/en.json';

const actions = vi.hoisted(() => ({
  startBrainExtractionAction: vi.fn(),
  retryExtractionFindingAction: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('../actions', () => actions);
vi.mock('sonner', () => ({ toast }));

const { ExtractDialog } = await import('../components/ExtractDialog');
const { RetryExtractionButton } =
  await import('../components/RetryExtractionButton');

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

beforeEach(() => vi.clearAllMocks());

describe('ExtractDialog', () => {
  const documents = [
    { fileId: 'f1', fileName: 'a.pdf', pages: 0 },
    { fileId: 'f2', fileName: 'b.pdf', pages: 4 },
  ];

  it('preselects what no page cites yet, and starts a run over the choice', async () => {
    actions.startBrainExtractionAction.mockResolvedValue({
      success: true,
      documents: 2,
    });
    wrap(<ExtractDialog documents={documents} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Extract from documents' }),
    );
    expect(screen.getByLabelText('a.pdf')).toBeChecked();
    expect(screen.getByLabelText('b.pdf')).not.toBeChecked();
    expect(screen.getByText('Pages: 4')).toBeVisible();

    fireEvent.click(screen.getByLabelText('b.pdf'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Start extraction (2)' }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(actions.startBrainExtractionAction).toHaveBeenCalledWith({
      fileIds: ['f1', 'f2'],
    });
  });

  it('cannot start with nothing chosen', () => {
    wrap(
      <ExtractDialog
        documents={[{ fileId: 'f2', fileName: 'b.pdf', pages: 1 }]}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Extract from documents' }),
    );
    expect(
      screen.getByRole('button', { name: 'Start extraction (0)' }),
    ).toBeDisabled();
  });
});

describe('RetryExtractionButton', () => {
  it('queues a retry and then says so instead of offering it again', async () => {
    actions.retryExtractionFindingAction.mockResolvedValue({
      success: true,
      documents: 1,
    });
    wrap(<RetryExtractionButton findingPublicId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Retry queued')).toBeVisible();
    expect(actions.retryExtractionFindingAction).toHaveBeenCalledWith({
      findingPublicId: 'p1',
    });
  });

  it('shows why a retry was refused', async () => {
    actions.retryExtractionFindingAction.mockResolvedValue({
      success: false,
      error: 'not-found',
    });
    wrap(<RetryExtractionButton findingPublicId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'This finding is closed or no longer exists.',
      ),
    );
  });
});
