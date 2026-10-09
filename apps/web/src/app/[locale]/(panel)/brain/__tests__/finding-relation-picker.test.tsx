import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, expect, it, vi } from 'vitest';
import messages from '@/app/messages/en.json';
const mocks = vi.hoisted(() => ({ add: vi.fn(), refresh: vi.fn() }));
vi.mock('../actions', () => ({ addKnowledgeRelationsAction: mocks.add }));
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
  Link: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
vi.mock('../assistant-actions', () => ({
  applyBrainProposalAction: vi.fn(),
  dismissBrainProposalAction: vi.fn(),
}));
import { FindingRelationPicker } from '../components/FindingRelationPicker';
const time = '2026-10-06T12:00:00.000Z';
const proposal = {
  id: 'proposal',
  action: 'ADD_RELATIONS' as const,
  reason: 'shared-source-document',
  outcome: null,
  page: { publicId: 'a', title: 'Source', updatedAt: time },
  targets: [
    { publicId: 'b', title: 'Target', updatedAt: time, kind: 'related to' },
    { publicId: 'c', title: 'Unselected', updatedAt: time, kind: 'related to' },
  ],
};
beforeEach(() => vi.clearAllMocks());
it('starts with no selected relations; applies only selected targets with both versions', async () => {
  mocks.add.mockResolvedValue({ success: true, changed: true });
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FindingRelationPicker proposal={proposal} />
    </NextIntlClientProvider>,
  );
  expect(screen.queryByRole('button', { name: /^Link selected/ })).toBeNull();
  expect(screen.getByLabelText('Target')).not.toBeChecked();
  fireEvent.click(screen.getByLabelText('Target'));
  fireEvent.click(screen.getByRole('button', { name: 'Link selected (1)' }));
  await waitFor(() =>
    expect(mocks.add).toHaveBeenCalledWith({
      publicId: 'a',
      expectedUpdatedAt: time,
      targets: [{ publicId: 'b', expectedUpdatedAt: time, kind: 'related to' }],
    }),
  );
  expect(await screen.findByTestId('brain-proposal-outcome')).toBeVisible();
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});
it('reports a conflict and keeps the choice without claiming success', async () => {
  mocks.add.mockResolvedValue({ success: false, error: 'conflict' });
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FindingRelationPicker proposal={proposal} />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByLabelText('Target'));
  fireEvent.click(screen.getByRole('button', { name: 'Link selected (1)' }));
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.queryByTestId('brain-proposal-outcome')).toBeNull();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it('selects every suggestion at once, and says how many it will link', async () => {
  mocks.add.mockResolvedValue({ success: true, changed: true });
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FindingRelationPicker proposal={proposal} />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
  expect(screen.getByLabelText('Target')).toBeChecked();
  expect(screen.getByLabelText('Unselected')).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Link selected (2)' }));
  await waitFor(() =>
    expect(mocks.add.mock.calls[0][0].targets).toHaveLength(2),
  );
});
it('clears the selection from the same control', () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FindingRelationPicker proposal={proposal} />
    </NextIntlClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(screen.getByLabelText('Target')).not.toBeChecked();
  expect(screen.queryByRole('button', { name: /^Link selected/ })).toBeNull();
});
