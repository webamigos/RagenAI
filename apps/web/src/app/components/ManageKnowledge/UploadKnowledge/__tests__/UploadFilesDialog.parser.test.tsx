import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '@/app/messages/en.json';

const getParserStatusAction = vi.hoisted(() => vi.fn());
vi.mock('@/app/actions', () => ({ getParserStatusAction }));
vi.mock('@/app/hooks/use-auth', () => ({
  useOrganization: () => ({ canManageOrg: false }),
}));

import { UploadFilesDialog } from '../UploadFilesDialog';

function show(isOpen = true) {
  render(
    <NextIntlClientProvider
      locale="en"
      messages={messages}
      timeZone="Europe/Warsaw"
    >
      <UploadFilesDialog
        isOpen={isOpen}
        files={[new File(['x'], 'regulamin.pdf')]}
        initialPiiPolicy="TOXIC_ONLY"
        isUploading={false}
        onClose={vi.fn()}
        onRemoveFile={vi.fn()}
        onSubmit={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  getParserStatusAction.mockReset();
});

describe('UploadFilesDialog — the parser (Docling spec C1, D5)', () => {
  it('warns, with since when, while the parser is down', async () => {
    getParserStatusAction.mockResolvedValue({
      state: 'down',
      since: '2026-09-28T07:15:00.000Z',
    });
    show();
    expect(await screen.findByTestId('parser-unavailable')).toHaveTextContent(
      'unavailable since 09:15',
    );
  });

  it.each([
    ['up', { state: 'up' }],
    ['unknown', { state: 'unknown' }],
  ])('says nothing when the parser is %s', async (_, status) => {
    getParserStatusAction.mockResolvedValue(status);
    show();
    await waitFor(() => expect(getParserStatusAction).toHaveBeenCalled());
    expect(screen.queryByTestId('parser-unavailable')).not.toBeInTheDocument();
  });

  it('says nothing when the read fails', async () => {
    getParserStatusAction.mockRejectedValue(new Error('network'));
    show();
    await waitFor(() => expect(getParserStatusAction).toHaveBeenCalled());
    expect(screen.queryByTestId('parser-unavailable')).not.toBeInTheDocument();
  });

  it('does not ask while the dialog is closed', () => {
    show(false);
    expect(getParserStatusAction).not.toHaveBeenCalled();
  });
});
