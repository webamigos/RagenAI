import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import { BulkPolicyDialog } from '../BulkPolicyDialog';

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href}>{children}</a>
  ),
}));

const messages = {
  'bulk-policy-modal': {
    title: 'Change PII policy',
    description: 'One policy for every file you selected: {count} files.',
    apply: 'Apply ({count} files)',
    applying: 'Applying...',
    'reprocess-label': 'Reprocess now',
    'reprocess-hint':
      'A new policy only takes effect the next time a file is parsed.',
    cancel: 'Cancel',
  },
  'pii-policy': {
    'select-label': 'PII policy',
    'none-label': 'None',
    'none-description': 'Keep everything',
    'toxic-only-label': 'Sensitive data',
    'toxic-only-description': 'Strip the sensitive kinds',
    'strict-label': 'All personal data',
    'strict-description': 'Strip every personal detail',
    'learn-more': 'Learn more',
  },
};

function renderDialog(props?: { isLoading?: boolean }) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BulkPolicyDialog
        isOpen
        count={3}
        onClose={onClose}
        onConfirm={onConfirm}
        {...props}
      />
    </NextIntlClientProvider>,
  );

  /** Close it and open it again, the way cancelling and reselecting does. */
  const reopen = (open: boolean) =>
    view.rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BulkPolicyDialog
          isOpen={open}
          count={3}
          onClose={onClose}
          onConfirm={onConfirm}
          {...props}
        />
      </NextIntlClientProvider>,
    );

  return { onConfirm, onClose, reopen };
}

describe('BulkPolicyDialog', () => {
  it('says how many files the policy will land on', () => {
    renderDialog();

    expect(
      screen.getByText('One policy for every file you selected: 3 files.'),
    ).toBeInTheDocument();
  });

  /**
   * A policy describes what to strip while a file is parsed, so changing it
   * leaves the indexed text as it was. Reprocessing is therefore the default
   * — a policy applied to nothing is not a policy — and the caller is told so
   * rather than having to infer it.
   */
  it('defaults to reprocessing, and reports the choice', async () => {
    const { onConfirm } = renderDialog();

    expect(screen.getByTestId('bulk-policy-reprocess')).toBeChecked();

    await userEvent.click(screen.getByTestId('bulk-policy-confirm'));

    expect(onConfirm).toHaveBeenCalledWith('TOXIC_ONLY', true);
  });

  it('passes the chosen policy, and honours an unchecked reprocess', async () => {
    const { onConfirm } = renderDialog();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'PII policy' }),
      'STRICT',
    );
    await userEvent.click(screen.getByTestId('bulk-policy-reprocess'));
    await userEvent.click(screen.getByTestId('bulk-policy-confirm'));

    expect(onConfirm).toHaveBeenCalledWith('STRICT', false);
  });

  it('locks the controls while the change is running', () => {
    renderDialog({ isLoading: true });

    expect(screen.getByTestId('bulk-policy-confirm')).toBeDisabled();
    expect(screen.getByTestId('bulk-policy-reprocess')).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'PII policy' })).toBeDisabled();
    expect(screen.getByText('Applying...')).toBeInTheDocument();
  });

  /**
   * A dialog that remembers is a dialog that lies about the selection under
   * it: pick STRICT, cancel, select three other files, open it again, and the
   * select still read STRICT with an Apply button that would have written it.
   */
  it('starts from the defaults again after it is closed and reopened', async () => {
    const { onConfirm, reopen } = renderDialog();

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'PII policy' }),
      'STRICT',
    );
    await userEvent.click(screen.getByTestId('bulk-policy-reprocess'));

    reopen(false);
    expect(screen.queryByTestId('bulk-policy-confirm')).not.toBeInTheDocument();

    reopen(true);
    expect(screen.getByTestId('bulk-policy-reprocess')).toBeChecked();

    await userEvent.click(screen.getByTestId('bulk-policy-confirm'));
    expect(onConfirm).toHaveBeenCalledWith('TOXIC_ONLY', true);
  });
});
