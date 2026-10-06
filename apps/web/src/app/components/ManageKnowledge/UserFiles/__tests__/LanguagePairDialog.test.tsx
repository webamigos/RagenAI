import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguagePairDialog } from '../LanguagePairDialog';
import messages from '@/app/messages/en.json';
import type { UserFileType } from '@/features/documents/contracts/document.types';

const suggest = vi.fn();
const create = vi.fn();
const remove = vi.fn();
vi.mock('@/app/actions/document-pairs', () => ({
  suggestDocumentPairsAction: (...a: unknown[]) => suggest(...a),
  createDocumentPairAction: (...a: unknown[]) => create(...a),
  removeDocumentPairAction: (...a: unknown[]) => remove(...a),
}));
vi.mock('@/app/lib/utils/logger', () => ({ logger: { warn: vi.fn() } }));

const file: UserFileType = {
  id: 'pl',
  organizationId: 'org',
  fileName: 'polityka.pdf',
  fileSize: 1,
  fileType: 'PDF',
  projectId: null,
  project: null,
  language: 'pol',
  piiPolicy: 'TOXIC_ONLY',
};
const paired: UserFileType = {
  ...file,
  pairedWith: {
    id: 'en',
    fileName: 'policy.pdf',
    language: 'eng',
    piiPolicy: 'STRICT',
  },
};

function show(f: UserFileType | null, onChanged = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LanguagePairDialog file={f} onClose={vi.fn()} onChanged={onChanged} />
    </NextIntlClientProvider>,
  );
  return onChanged;
}

beforeEach(() => {
  vi.clearAllMocks();
  suggest.mockResolvedValue([]);
  create.mockResolvedValue({ ok: true, pairId: 'p' });
  remove.mockResolvedValue({ ok: true });
});

describe('LanguagePairDialog', () => {
  it('asks for nothing while closed', () => {
    show(null);
    expect(suggest).not.toHaveBeenCalled();
  });

  it('lists suggestions and pairs only when the person presses Pair', async () => {
    suggest.mockResolvedValue([
      {
        id: 'en',
        fileName: 'policy.pdf',
        language: 'eng',
        piiPolicy: 'STRICT',
      },
    ]);
    const onChanged = show(file);
    expect(await screen.findByText(/policy\.pdf/)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText(/different PII policies/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pair' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith('pl', 'en'));
    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith('Files paired.'),
    );
  });

  it('says so when there is nothing to suggest', async () => {
    show(file);
    expect(await screen.findByText(/No suggestions/)).toBeInTheDocument();
  });

  it('shows a refused pairing as an error and does not report success', async () => {
    suggest.mockResolvedValue([
      {
        id: 'en',
        fileName: 'policy.pdf',
        language: 'eng',
        piiPolicy: 'TOXIC_ONLY',
      },
    ]);
    create.mockResolvedValue({ ok: false, error: 'already-paired' });
    const onChanged = show(file);
    fireEvent.click(await screen.findByRole('button', { name: 'Pair' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('shows the current pair and removes it, without asking for suggestions', async () => {
    const onChanged = show(paired);
    expect(
      screen.getByText(/polityka\.pdf is paired with policy\.pdf/),
    ).toBeInTheDocument();
    expect(suggest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove pair' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('pl'));
    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith('Pair removed.'),
    );
  });
});
