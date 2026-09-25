import { render, screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import en from '@/app/messages/en.json';
import type { KnowledgeFindingListItem } from '@/features/brain/contracts/brain.types';

/**
 * Read-only mode (`manageBrain` off, or a member let in by `brainForMembers`)
 * hides every control a reader cannot use. The actions refuse on their own
 * check (actions.test.ts); this is the half a visitor sees.
 */

const deps = vi.hoisted(() => ({
  getBrainAccessQuery: vi.fn(),
  getExtractableDocumentsQuery: vi.fn(),
}));

vi.mock('@/features/brain/services/queries/get-brain-access-query', () => ({
  getBrainAccessQuery: deps.getBrainAccessQuery,
}));
vi.mock(
  '@/features/brain/services/queries/get-extractable-documents-query',
  () => ({ getExtractableDocumentsQuery: deps.getExtractableDocumentsQuery }),
);
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: 'en', messages: en, namespace } as never),
  getFormatter: async () => ({
    dateTime: (d: Date) => d.toISOString(),
    relativeTime: () => 'recently',
  }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('../components/BrainTabs', () => ({ BrainTabs: () => null }));
vi.mock('@/features/brain/services/queries/brain-language-scope', () => ({
  getBrainLanguagesQuery: async () => [],
}));
vi.mock('../components/LanguageFilter', () => ({ LanguageFilter: () => null }));
vi.mock('../components/ExtractDialog', () => ({
  ExtractDialog: () => <button type="button">Extract from documents</button>,
}));
vi.mock('../components/RetryExtractionButton', () => ({
  RetryExtractionButton: () => <button type="button">Retry</button>,
}));
vi.mock('../components/FindingSummaryView', () => ({
  FindingSummaryView: () => <span>summary</span>,
}));

const { default: BrainLayout } = await import('../layout');
const { FindingsTable } = await import('../components/FindingsTable');

beforeEach(() => {
  vi.clearAllMocks();
  deps.getExtractableDocumentsQuery.mockResolvedValue([]);
});

describe('BrainLayout', () => {
  it('says it is read-only and offers no extraction to a reader', async () => {
    deps.getBrainAccessQuery.mockResolvedValue({
      orgId: 'org-1',
      access: 'read',
      canWrite: false,
    });
    render(await BrainLayout({ children: <p>page</p> }));

    expect(screen.getByTestId('brain-read-only')).toHaveTextContent(
      en.brain['read-only'].notice,
    );
    expect(
      screen.queryByRole('button', { name: 'Extract from documents' }),
    ).not.toBeInTheDocument();
    // Nor asks for the documents a reader could never extract from.
    expect(deps.getExtractableDocumentsQuery).not.toHaveBeenCalled();
  });

  it('shows a curator the extraction and no notice', async () => {
    deps.getBrainAccessQuery.mockResolvedValue({
      orgId: 'org-1',
      access: 'write',
      canWrite: true,
    });
    render(await BrainLayout({ children: <p>page</p> }));

    expect(
      screen.getByRole('button', { name: 'Extract from documents' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('brain-read-only')).not.toBeInTheDocument();
  });

  it('404s anyone Brain does not let in', async () => {
    deps.getBrainAccessQuery.mockResolvedValue(null);
    await expect(BrainLayout({ children: null })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });
});

describe('FindingsTable', () => {
  const failed: KnowledgeFindingListItem = {
    publicId: 'f-1',
    type: 'EXTRACTION_FAILED',
    severity: 'WARN' as KnowledgeFindingListItem['severity'],
    status: 'OPEN',
    detectedAt: '2026-09-24T08:00:00.000Z',
    pages: [],
    file: { name: 'Instrukcja_ADR.docx', documentId: null },
    summary: { kind: 'extraction_failed', reason: null },
  };

  it('offers a curator the retry', async () => {
    render(await FindingsTable({ items: [failed] }));
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows a reader the finding without the retry', async () => {
    render(await FindingsTable({ items: [failed], canWrite: false }));
    expect(screen.getByText('summary')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry' }),
    ).not.toBeInTheDocument();
  });

  it('links "discuss" through the builder the list gives it, and marks the focused row', async () => {
    const other = { ...failed, publicId: 'f-2' };
    render(
      await FindingsTable({
        items: [failed, other],
        assistant: true,
        focusedId: 'f-1',
        discussHref: (id) =>
          `/brain/findings?status=RESOLVED&page=2&finding=${id}`,
      }),
    );
    // The routing mock renders a bare <a>, so the link is found by its text.
    const links = screen.getAllByRole('link', {
      name: 'Ask the assistant about this',
    });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute(
      'href',
      '/brain/findings?status=RESOLVED&page=2&finding=f-2',
    );
    expect(document.getElementById('finding-f-1')).toHaveAttribute(
      'aria-current',
      'true',
    );
  });
});
