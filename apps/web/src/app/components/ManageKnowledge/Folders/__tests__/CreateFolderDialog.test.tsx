import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { CreateFolderDialog } from '../CreateFolderDialog';

const mockSuccessToast = vi.fn();
const mockErrorToast = vi.fn();
const mockCreateFolder = vi.fn();

vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({
    successToast: (...args: unknown[]) => mockSuccessToast(...args),
    errorToast: (...args: unknown[]) => mockErrorToast(...args),
  }),
}));

vi.mock('@/app/actions/folders', () => ({
  createFolder: (...args: unknown[]) => mockCreateFolder(...args),
}));

vi.mock('@/app/hooks/use-auth', () => ({
  useOrganization: () => ({ canManageOrg: false }),
}));

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const messages = {
  folders: {
    'create-dialog': {
      title: 'Translated title',
      'subfolder-title': 'Translated child of {name}',
      'name-label': 'Translated name',
      'name-placeholder': 'Translated placeholder',
      'team-label': 'Translated team',
      'organization-wide': 'Translated organization',
      'team-hint': 'Translated hint',
      success: 'Translated success',
      error: 'Translated error',
      cancel: 'Translated cancel',
      create: 'Translated create',
      creating: 'Translated creating',
    },
  },
  'pii-policy': {
    label: 'Translated PII policy',
    'none-label': 'None',
    'none-description': 'No masking',
    'toxic-only-label': 'Toxic only',
    'toxic-only-description': 'Mask toxic content',
    'strict-label': 'Strict',
    'strict-description': 'Mask all PII',
    'select-label': 'PII Policy',
  },
};

function renderDialog(parentName?: string) {
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <CreateFolderDialog
        isOpen
        onClose={vi.fn()}
        onCreated={vi.fn()}
        teams={[]}
        parentName={parentName}
      />
    </NextIntlClientProvider>,
  );
}

describe('CreateFolderDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateFolder.mockResolvedValue(undefined);
  });

  it('renders dialog copy through the translator, including the parent name', () => {
    renderDialog('Engineering');

    expect(
      screen.getByRole('heading', { name: 'Translated child of Engineering' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Translated name')).toHaveAttribute(
      'placeholder',
      'Translated placeholder',
    );
    expect(screen.getByText('Translated team')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Translated create' }),
    ).toBeInTheDocument();
  });

  it('uses the translated success toast after creating a folder', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText('Translated name'), 'Contracts');
    await user.click(screen.getByRole('button', { name: 'Translated create' }));

    await waitFor(() => {
      expect(mockSuccessToast).toHaveBeenCalledWith({
        message: 'Translated success',
      });
    });
  });
});
