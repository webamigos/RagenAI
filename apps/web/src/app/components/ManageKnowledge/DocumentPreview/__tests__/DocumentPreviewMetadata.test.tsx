import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import { DocumentPreviewMetadata } from '../DocumentPreviewMetadata';
import type { UserFileTypeSafe } from '../../UserFiles/FileList/UserFilesTable';
import { EmbeddingStatus } from '@/generated/prisma/browser';
import messages from '@/app/messages/en.json';

/**
 * Rendered against the **real** `en.json`, not an inline fixture.
 *
 * That is the whole point of this file. `document-preview.action-optimize`
 * shipped with no translation in any of the fifteen locales, so the panel
 * showed the key path where a label belongs. Every existing test in this
 * directory passed, because each declares its own `messages` object inline
 * and therefore cannot tell a missing key from a present one — the fixture
 * *is* the answer sheet.
 *
 * `next-intl` renders the key path when a key is absent, so asserting on the
 * label text catches it.
 */

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: vi.fn(() => '/'),
}));

const file = {
  id: 'file-1',
  organizationId: 'org-1',
  fileName: 'handbook.pdf',
  fileSize: 2048,
  fileType: 'PDF',
  projectId: 'proj-1',
  project: null,
  createdAt: new Date('2026-09-06T12:54:00Z'),
  embeddingStatus: EmbeddingStatus.COMPLETED,
  embeddingStartedAt: null,
  embeddingCompletedAt: null,
  embeddingFailedAt: null,
  document: { id: 'doc-1' },
} as unknown as UserFileTypeSafe;

function show(overrides: Partial<UserFileTypeSafe> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DocumentPreviewMetadata
        file={{ ...file, ...overrides }}
        onDownload={vi.fn()}
        onShare={vi.fn()}
        onMove={vi.fn()}
        onDelete={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}

describe('DocumentPreviewMetadata actions', () => {
  it('labels every action, with no key paths left showing', () => {
    show();

    for (const label of ['Download', 'Share', 'Move', 'Optimize', 'Delete']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('renders no key path anywhere in the panel', () => {
    // The general form of the bug, rather than the one key that had it: a
    // missing message renders as `namespace.key`, and no real label in this
    // panel contains a dot between two lowercase words.
    const { container } = show();

    expect(container.textContent).not.toMatch(/\b[a-z-]+\.[a-z-]{3,}\b/);
  });

  it('offers Optimize only for a file that has a document behind it', () => {
    // The action routes to `/knowledge/documents/{id}`, so without a document
    // there is nowhere to send anyone.
    show({ document: undefined } as unknown as Partial<UserFileTypeSafe>);

    expect(screen.queryByText('Optimize')).toBeNull();
    expect(screen.getByText('Download')).toBeInTheDocument();
  });
});
