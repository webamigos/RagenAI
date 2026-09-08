import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import { ConfirmDialog } from '../ConfirmDialog';

const messages = { common: { cancel: 'Anuluj', confirm: 'Potwierdź' } };

function renderDialog(
  props: Partial<Parameters<typeof ConfirmDialog>[0]> = {},
) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();

  render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Usunąć użytkownika?"
        description="Tego nie da się cofnąć."
        onConfirm={onConfirm}
        {...props}
      />
    </NextIntlClientProvider>,
  );

  return { onConfirm, onOpenChange };
}

describe('ConfirmDialog', () => {
  it('announces itself with a title and a description', async () => {
    // Radix needs both for the alertdialog role to be announced properly —
    // the native confirm() this replaces had no title at all.
    renderDialog();

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Usunąć użytkownika?')).toBeInTheDocument();
    expect(screen.getByText('Tego nie da się cofnąć.')).toBeInTheDocument();
  });

  it('runs the action only when confirmed', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.click(await screen.findByRole('button', { name: 'Potwierdź' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not run the action when cancelled', async () => {
    // The half that matters: `confirm()` returning false was the only thing
    // standing between a misclick and a deleted row.
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.click(await screen.findByRole('button', { name: 'Anuluj' }));

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('falls back to the shared labels', async () => {
    renderDialog();

    expect(
      await screen.findByRole('button', { name: 'Potwierdź' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anuluj' })).toBeInTheDocument();
  });

  it('takes a caller-supplied confirm label', async () => {
    renderDialog({ confirmLabel: 'Usuń' });

    expect(
      await screen.findByRole('button', { name: 'Usuń' }),
    ).toBeInTheDocument();
  });

  it('renders nothing while closed', () => {
    renderDialog({ open: false });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('marks a destructive action so it does not look like an ordinary one', async () => {
    renderDialog({ confirmLabel: 'Usuń', destructive: true });

    const action = await screen.findByRole('button', { name: 'Usuń' });
    expect(action.className).toMatch(/text-red-600/);
  });

  it('leaves a non-destructive action unstyled', async () => {
    renderDialog({ confirmLabel: 'Dalej' });

    const action = await screen.findByRole('button', { name: 'Dalej' });
    expect(action.className).not.toMatch(/text-red-600/);
  });
});
