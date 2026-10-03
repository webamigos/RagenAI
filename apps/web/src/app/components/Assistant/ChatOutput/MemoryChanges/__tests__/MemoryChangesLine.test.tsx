import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';

const undo = vi.hoisted(() => vi.fn());
vi.mock('../actions', () => ({ undoMemoryChangeAction: undo }));
vi.mock('@/i18n/routing', () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { MemoryChangesLine } from '../MemoryChangesLine';
import messages from '@/app/messages/en.json';
import type { MemoryChangeView } from '@/features/memory/contracts/memory.types';

const view = (over: Partial<MemoryChangeView> = {}): MemoryChangeView => ({
  publicId: 'c1',
  operation: 'ADD',
  content: 'Prefers bullet points.',
  state: 'undoable',
  ...over,
});

const show = (
  changes: MemoryChangeView[],
  onChanged = vi.fn(async () => {}),
) => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MemoryChangesLine changes={changes} onChanged={onChanged} />
    </NextIntlClientProvider>,
  );
  return onChanged;
};

beforeEach(() => {
  undo.mockReset();
});

describe('MemoryChangesLine', () => {
  it('renders nothing for a turn that changed nothing', () => {
    show([]);
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('names each change in words, by operation', () => {
    show([
      view(),
      view({
        publicId: 'c2',
        operation: 'UPDATE',
        content: 'Is a senior accountant.',
      }),
      view({
        publicId: 'c3',
        operation: 'DELETE',
        content: 'Works on the X tender.',
      }),
    ]);
    expect(screen.getByText('Remembered: Prefers bullet points.')).toBeTruthy();
    expect(
      screen.getByText('Updated memory: Is a senior accountant.'),
    ).toBeTruthy();
    expect(screen.getByText('Forgot: Works on the X tender.')).toBeTruthy();
  });

  it('undoes a change, then reads the thread’s changes again', async () => {
    undo.mockResolvedValue({ success: true, result: 'undone' });
    const onChanged = show([view()]);

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(undo).toHaveBeenCalledWith('c1');
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it('says "Undone" instead of offering the button again', () => {
    show([view({ state: 'undone' })]);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Undone')).toBeTruthy();
  });

  it('sends a stale change to settings instead of offering undo', () => {
    show([view({ state: 'stale' })]);
    expect(screen.queryByRole('button')).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Changed since, edit it in settings' }),
    ).toHaveProperty('href', expect.stringMatching(/\/settings\/memory$/));
  });

  it('explains a refused restore when memory is full', async () => {
    undo.mockResolvedValue({ success: true, result: 'full' });
    show([view({ operation: 'DELETE' })]);

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Memory is full, remove one in settings first',
    );
  });

  it('says so when the undo fails', async () => {
    undo.mockResolvedValue({ success: false, error: 'failed' });
    show([view()]);

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect((await screen.findByRole('status')).textContent).toBe(
      'Could not undo, try again',
    );
  });
});
