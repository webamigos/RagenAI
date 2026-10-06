import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { KnowledgeListIssues } from '../KnowledgeListIssues';
import { OrgFeaturesProvider } from '@/context/OrgFeaturesContext';
import { DEFAULT_FEATURES } from '@/features/subscriptions/contracts/features.types';
import messages from '@/app/messages/en.json';
import type { UserFileType } from '@/features/documents/contracts/document.types';
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
const file: UserFileType = {
  id: 'sheet',
  organizationId: 'org',
  fileName: 'prices.xlsx',
  fileSize: 10,
  fileType: 'XLSX',
  projectId: null,
  project: null,
  embeddingStatus: 'COMPLETED',
  document: { id: 'doc' },
  brainCoverage: { approved: 0, candidates: 0 },
  metadata: {
    diagnostics: {
      version: 1,
      computedAt: '2026-10-06T12:00:00Z',
      findings: [{ check: 'table-without-header', severity: 'warn' }],
      stats: {
        chunkCount: 10,
        tableChunkCount: 10,
        medianChunkChars: 700,
        sectionPathShare: null,
        overlapShare: 0,
      },
    },
  },
};
function show(
  files: UserFileType[],
  onOptimize = vi.fn(),
  onReprocess = vi.fn(),
) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OrgFeaturesProvider
        features={{ ...DEFAULT_FEATURES, documentDiagnostics: true }}
      >
        <KnowledgeListIssues
          files={files}
          onOptimize={onOptimize}
          onReprocess={onReprocess}
        />
      </OrgFeaturesProvider>
    </NextIntlClientProvider>,
  );
}
describe('knowledge list attention summary', () => {
  it('is absent when there are no actionable findings', () => {
    show([]);
    expect(
      screen.queryByTestId('knowledge-list-issues'),
    ).not.toBeInTheDocument();
  });
  it('labels its page scope and offers reprocessing instead of unsupported prose optimization', () => {
    const optimize = vi.fn();
    const reprocess = vi.fn();
    show([file], optimize, reprocess);
    expect(screen.getByText('on this page')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Optimize eligible documents' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Reprocess table documents' }),
    );
    expect(reprocess).toHaveBeenCalledWith(['sheet']);
    expect(optimize).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Show in Brain' })).toHaveAttribute(
      'href',
      '/brain/documents?coverage=empty',
    );
  });
});
