import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '@/app/messages/en.json';

const actions = vi.hoisted(() => ({
  approveKnowledgePageAction: vi.fn(),
  rejectKnowledgePageAction: vi.fn(),
  setKnowledgePageOwnerAction: vi.fn(),
  setKnowledgePageAccessAction: vi.fn(),
  mergeKnowledgePagesAction: vi.fn(),
}));
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('../actions', () => actions);
vi.mock('@/i18n/routing', () => ({ useRouter: () => router }));
vi.mock('sonner', () => ({ toast }));

const { ReviewActions } = await import('../components/ReviewActions');
const { AccessEditor } = await import('../components/AccessEditor');
const { MergePicker } = await import('../components/MergePicker');

const PUBLIC_ID = '11111111-2222-4333-8444-555555555555';
const UPDATED = '2026-09-23T10:00:00.000Z';

function wrap(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ReviewActions', () => {
  it('keeps approve disabled, and says why, until the page has an owner', () => {
    wrap(
      <ReviewActions
        publicId={PUBLIC_ID}
        updatedAt={UPDATED}
        hasOwner={false}
      />,
    );
    expect(screen.getByRole('button', { name: 'Approve page' })).toBeDisabled();
    expect(screen.getByText(/Set an owner before approving/)).toBeVisible();
  });

  it('approves with the updatedAt it was rendered with, then refreshes', async () => {
    actions.approveKnowledgePageAction.mockResolvedValue({
      success: true,
      changed: true,
    });
    wrap(<ReviewActions publicId={PUBLIC_ID} updatedAt={UPDATED} hasOwner />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve page' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(actions.approveKnowledgePageAction).toHaveBeenCalledWith({
      publicId: PUBLIC_ID,
      expectedUpdatedAt: UPDATED,
    });
    expect(toast.success).toHaveBeenCalledWith('Page approved');
  });

  it('asks before rejecting, and rejects only on confirmation', async () => {
    actions.rejectKnowledgePageAction.mockResolvedValue({
      success: true,
      changed: true,
    });
    wrap(<ReviewActions publicId={PUBLIC_ID} updatedAt={UPDATED} hasOwner />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject page' }));
    expect(actions.rejectKnowledgePageAction).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(
      Array.from(dialog.querySelectorAll('button')).find(
        (b) => b.textContent === 'Reject page',
      )!,
    );
    await waitFor(() =>
      expect(actions.rejectKnowledgePageAction).toHaveBeenCalledTimes(1),
    );
  });

  it('shows a conflict as an error and reloads the page', async () => {
    actions.approveKnowledgePageAction.mockResolvedValue({
      success: false,
      error: 'conflict',
    });
    wrap(<ReviewActions publicId={PUBLIC_ID} updatedAt={UPDATED} hasOwner />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve page' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error.mock.calls[0][0]).toMatch(/changed this page/);
    expect(router.refresh).toHaveBeenCalled();
  });
});

describe('AccessEditor', () => {
  const options = {
    members: [
      { userId: 'u1', name: 'Anna' },
      { userId: 'u2', name: 'Bartek' },
    ],
    teams: [{ id: 't1', name: 'HR' }],
  };

  function open() {
    wrap(
      <AccessEditor
        publicId={PUBLIC_ID}
        updatedAt={UPDATED}
        orgId="org-1"
        principals={['user:u1']}
        options={options}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Change access' }));
  }

  it('confirms a widening the server reports, naming who gains access', async () => {
    actions.setKnowledgePageAccessAction
      .mockResolvedValueOnce({ success: false, error: 'confirm-widening' })
      .mockResolvedValueOnce({ success: true, changed: true });
    open();
    fireEvent.click(screen.getByLabelText('Bartek'));
    fireEvent.click(screen.getByRole('button', { name: 'Save access' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Bartek will be able to read this page');
    expect(dialog).not.toHaveTextContent('Anna');
    expect(toast.error).not.toHaveBeenCalled();
    expect(actions.setKnowledgePageAccessAction.mock.calls[0][0]).toMatchObject(
      {
        principals: ['user:u1', 'user:u2'],
        confirmWidening: false,
      },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Widen access' }));
    await waitFor(() =>
      expect(actions.setKnowledgePageAccessAction).toHaveBeenCalledTimes(2),
    );
    expect(actions.setKnowledgePageAccessAction.mock.calls[1][0]).toMatchObject(
      {
        principals: ['user:u1', 'user:u2'],
        confirmWidening: true,
      },
    );
  });

  it('sends the organization alone when everyone is chosen', async () => {
    actions.setKnowledgePageAccessAction.mockResolvedValue({
      success: true,
      changed: true,
    });
    open();
    fireEvent.click(screen.getByLabelText('The whole organization'));
    fireEvent.click(screen.getByRole('button', { name: 'Save access' }));
    await waitFor(() =>
      expect(actions.setKnowledgePageAccessAction).toHaveBeenCalled(),
    );
    expect(
      actions.setKnowledgePageAccessAction.mock.calls[0][0].principals,
    ).toEqual(['org:org-1']);
  });

  it('warns that an empty list leaves the page open to no one', () => {
    open();
    fireEvent.click(screen.getByLabelText('Anna'));
    expect(screen.getByText(/open to no one/)).toBeVisible();
  });
});

describe('MergePicker', () => {
  const TARGET = '66666666-7777-4888-9999-aaaaaaaaaaaa';

  it('says so when there is nothing to merge into', () => {
    wrap(<MergePicker publicId={PUBLIC_ID} updatedAt={UPDATED} targets={[]} />);
    expect(screen.getByText('No other page to merge into')).toBeVisible();
  });

  it('merges after confirmation and lands on the page that stayed', async () => {
    actions.mergeKnowledgePagesAction.mockResolvedValue({
      success: true,
      changed: true,
    });
    wrap(
      <MergePicker
        publicId={PUBLIC_ID}
        updatedAt={UPDATED}
        targets={[
          {
            publicId: TARGET,
            title: 'Urlop',
            status: 'APPROVED',
            suggested: true,
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Merge into' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Urlop' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Merge into this page' }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('“Urlop”');
    expect(actions.mergeKnowledgePagesAction).not.toHaveBeenCalled();
    fireEvent.click(
      Array.from(dialog.querySelectorAll('button')).find(
        (b) => b.textContent === 'Merge into this page',
      )!,
    );
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith(`/brain/pages/${TARGET}`),
    );
    expect(actions.mergeKnowledgePagesAction).toHaveBeenCalledWith({
      publicId: PUBLIC_ID,
      expectedUpdatedAt: UPDATED,
      targetPublicId: TARGET,
    });
  });
});
