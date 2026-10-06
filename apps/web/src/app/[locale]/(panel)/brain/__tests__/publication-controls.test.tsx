import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '@/app/messages/en.json';

const actions = vi.hoisted(() => ({
  publishKnowledgePageAction: vi.fn(),
  unpublishKnowledgePageAction: vi.fn(),
}));
vi.mock('../actions', () => actions);
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('@/i18n/routing', () => ({ useRouter: () => router }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { PublicationControls } =
  await import('../components/PublicationControls');

const props = {
  publicId: '11111111-2222-4333-8444-555555555555',
  updatedAt: '2026-09-24T01:00:00.000Z',
  outdated: false,
  blockers: [] as string[],
};
const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

describe('PublicationControls', () => {
  it('says what blocks a publication and keeps the button disabled', () => {
    wrap(
      <PublicationControls
        {...props}
        state="none"
        blockers={['Set an owner first']}
      />,
    );
    expect(screen.getByText('Not in the knowledge base')).toBeVisible();
    expect(screen.getByText('Set an owner first')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Publish to knowledge base' }),
    ).toBeDisabled();
  });

  it('publishes with the updatedAt it was rendered with', async () => {
    actions.publishKnowledgePageAction.mockResolvedValue({
      success: true,
      changed: true,
    });
    wrap(<PublicationControls {...props} state="none" />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Publish to knowledge base' }),
    );
    await waitFor(() =>
      expect(actions.publishKnowledgePageAction).toHaveBeenCalledWith({
        publicId: props.publicId,
        expectedUpdatedAt: props.updatedAt,
      }),
    );
  });

  it('withdraws a serving page only after confirmation', async () => {
    actions.unpublishKnowledgePageAction.mockResolvedValue({
      success: true,
      changed: true,
    });
    wrap(<PublicationControls {...props} state="published" />);
    expect(screen.getByText(/answers can cite it/)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Publish to knowledge base' }),
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(actions.unpublishKnowledgePageAction).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(
      Array.from(dialog.querySelectorAll('button')).find(
        (b) => b.textContent === 'Withdraw',
      )!,
    );
    await waitFor(() =>
      expect(actions.unpublishKnowledgePageAction).toHaveBeenCalledTimes(1),
    );
  });

  it('offers a republish when the page changed since it was published', () => {
    wrap(<PublicationControls {...props} state="published" outdated />);
    expect(screen.getByText(/changed since it was published/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Republish' })).toBeEnabled();
  });

  it('refreshes a pending publication and stops after it completes', () => {
    vi.useFakeTimers();
    const { rerender, unmount } = wrap(
      <PublicationControls {...props} state="publishing" />,
    );
    act(() => vi.advanceTimersByTime(2000));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PublicationControls {...props} state="published" />
      </NextIntlClientProvider>,
    );
    act(() => vi.advanceTimersByTime(6000));
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/answers can cite it/)).toBeVisible();
    unmount();
  });

  it('backs off refreshes for a long-running publication', () => {
    vi.useFakeTimers();
    const { unmount } = wrap(
      <PublicationControls {...props} state="publishing" />,
    );
    act(() => vi.advanceTimersByTime(60000));
    const calls = router.refresh.mock.calls.length;
    act(() => vi.advanceTimersByTime(29999));
    expect(router.refresh).toHaveBeenCalledTimes(calls);
    act(() => vi.advanceTimersByTime(1));
    expect(router.refresh).toHaveBeenCalledTimes(calls + 1);
    unmount();
  });

  it('cancels publication refreshes when the reviewer leaves', () => {
    vi.useFakeTimers();
    const { unmount } = wrap(
      <PublicationControls {...props} state="publishing" />,
    );
    unmount();
    act(() => vi.advanceTimersByTime(6000));
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
