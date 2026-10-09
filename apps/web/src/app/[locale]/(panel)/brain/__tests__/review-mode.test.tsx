import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, expect, it, vi } from 'vitest';
import messages from '@/app/messages/en.json';
import type { KnowledgePageDetail } from '@/features/brain/contracts/brain.types';
const actions = vi.hoisted(() => ({
  approveKnowledgePageAction: vi.fn(),
  approveAndPublishKnowledgePageAction: vi.fn(),
  rejectKnowledgePageAction: vi.fn(),
  setOwnerForDocumentCandidatesAction: vi.fn(),
}));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('../actions', () => actions);
vi.mock('@/i18n/routing', () => ({
  useRouter: () => router,
  Link: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('../components/OwnerPicker', () => ({
  OwnerPicker: ({
    saveAction,
    onPendingChange,
  }: {
    saveAction?: (id: string) => Promise<unknown>;
    onPendingChange?: (pending: boolean) => void;
  }) => (
    <>
      <button onClick={() => saveAction?.('owner')}>Save selected owner</button>
      <button onClick={() => onPendingChange?.(true)}>
        Owner save pending
      </button>
    </>
  ),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const { BrainReviewMode } = await import('../components/BrainReviewMode');
const source = {
  id: 1,
  quote: '26 days',
  span: 'Leave',
  state: 'current' as const,
  fileName: 'hr.pdf',
  documentId: null,
  pinnedVersion: 1,
};
const page = {
  publicId: 'one',
  title: 'Leave',
  type: 'POLICY',
  status: 'CANDIDATE',
  content: '- 20 days [1]\n- No citation\n---\n1. 26 days',
  ownerId: null,
  updatedAt: '2026-10-06T10:00:00.000Z',
  principals: ['org:org'],
  sources: [source],
  edges: [],
  lastVerifiedAt: null,
} as unknown as KnowledgePageDetail;
const queue = ['one', 'two'].map((publicId) => ({
  publicId,
  title: publicId,
  type: 'POLICY' as const,
  documents: [{ fileId: 'file', fileName: 'hr.pdf' }],
}));
function show(
  overrides: Partial<React.ComponentProps<typeof BrainReviewMode>> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BrainReviewMode
        queue={queue}
        page={page}
        members={[{ userId: 'owner', name: 'Anna' }]}
        candidateCounts={{ file: 2 }}
        language={null}
        canWrite
        warningsEnabled={false}
        progress={{ reviewed: 0, total: 2 }}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  for (const action of Object.values(actions)) {
    action.mockResolvedValue({ success: true, changed: true });
  }
});
it('keeps approval disabled until an owner is set and hides heuristic notes by default', () => {
  show();
  expect(
    screen.getByRole('button', { name: 'Approve and publish' }),
  ).toBeDisabled();
  // The reason sits under the button it explains, and names it.
  const reason = screen.getByTestId('review-publish-blocker');
  expect(reason).toHaveTextContent('Set an owner before approving this page.');
  expect(
    screen.getByRole('button', { name: 'Approve and publish' }),
  ).toHaveAccessibleDescription('Set an owner before approving this page.');
  expect(
    screen.getByRole('button', { name: 'Approve and publish' })
      .nextElementSibling,
  ).toBe(reason);
  expect(screen.getByText('26 days')).toBeVisible();
  expect(screen.queryByText(/Paraphrase:/)).not.toBeInTheDocument();
});
it('shows heuristic missing facts only on opt-in and keeps claim checks local', () => {
  show({ warningsEnabled: true });
  expect(screen.getByText(/Paraphrase:.*26/)).toBeVisible();
  // Said once, before the claims, that the marks are not saved.
  expect(screen.getByTestId('review-local-checks')).toHaveTextContent(
    'are not saved',
  );
  expect(screen.getAllByText('Correct')[0]).toBeVisible();
  expect(screen.getAllByText('Needs a fix')[0]).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Correct: claim 1' }));
  expect(
    screen.getByRole('button', { name: 'Correct: claim 1' }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(actions.approveKnowledgePageAction).not.toHaveBeenCalled();
});
it('sets the owner for all candidates from the selected document', async () => {
  show();
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'Set for all 2 pages to review from this document',
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save selected owner' }));
  await waitFor(() =>
    expect(actions.setOwnerForDocumentCandidatesAction).toHaveBeenCalledWith({
      fileId: 'file',
      ownerId: 'owner',
    }),
  );
});
it('approves with A, moves to the next page and ignores typing or modified shortcuts', async () => {
  show({ page: { ...page, ownerId: 'owner' } });
  const input = document.createElement('input');
  document.body.append(input);
  fireEvent.keyDown(input, { key: 'a' });
  fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
  expect(actions.approveAndPublishKnowledgePageAction).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: 'a' });
  await waitFor(() =>
    expect(router.push).toHaveBeenCalledWith('/brain/review?page=two'),
  );
  expect(actions.approveAndPublishKnowledgePageAction).toHaveBeenCalledWith({
    publicId: 'one',
    expectedUpdatedAt: page.updatedAt,
  });
  input.remove();
});
it('J/K navigate without writing, and read-only mode never handles decision keys', () => {
  show({ canWrite: false });
  fireEvent.keyDown(window, { key: 'j' });
  expect(router.push).toHaveBeenCalledWith('/brain/review?page=two');
  fireEvent.keyDown(window, { key: 'a' });
  fireEvent.keyDown(window, { key: 'r' });
  expect(actions.approveAndPublishKnowledgePageAction).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('button', { name: 'Approve and publish' }),
  ).not.toBeInTheDocument();
});
it('reject asks for confirmation, then moves forward only on success', async () => {
  show({ page: { ...page, ownerId: 'owner' } });
  fireEvent.keyDown(window, { key: 'r' });
  expect(await screen.findByRole('alertdialog')).toBeVisible();
  expect(actions.rejectKnowledgePageAction).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('alertdialog').querySelector('button:last-child')!,
  );
  await waitFor(() =>
    expect(actions.rejectKnowledgePageAction).toHaveBeenCalled(),
  );
});
it('does not advance after a failed publication', async () => {
  actions.approveAndPublishKnowledgePageAction.mockResolvedValue({
    success: false,
    error: 'failed-to-start',
    approved: true,
  });
  show({ page: { ...page, ownerId: 'owner' } });
  fireEvent.keyDown(window, { key: 'a' });
  await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  expect(router.push).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('The page was approved');
});

it('ignores decision and navigation keys while the owner is saving', () => {
  show({ page: { ...page, ownerId: 'owner' } });
  fireEvent.click(screen.getByRole('button', { name: 'Owner save pending' }));
  fireEvent.keyDown(window, { key: 'a' });
  fireEvent.keyDown(window, { key: 'j' });
  expect(actions.approveAndPublishKnowledgePageAction).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
});
