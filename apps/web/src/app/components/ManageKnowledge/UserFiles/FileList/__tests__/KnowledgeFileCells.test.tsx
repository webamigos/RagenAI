import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { BrainCoverageCell, ChatQualityCell } from '../KnowledgeFileCells';
import { OrgFeaturesProvider } from '@/context/OrgFeaturesContext';
import { DEFAULT_FEATURES } from '@/features/subscriptions/contracts/features.types';
import messages from '@/app/messages/en.json';
import type { UserFileType } from '@/features/documents/contracts/document.types';
const file: UserFileType = {
  id: 'file',
  organizationId: 'org',
  fileName: 'policy.docx',
  fileSize: 10,
  fileType: 'DOCX',
  projectId: null,
  project: null,
  embeddingStatus: 'COMPLETED',
  document: { id: 'doc' },
};
const report = (findings: { check: string; severity: string }[]) => ({
  diagnostics: {
    version: 1,
    computedAt: '2026-10-06T12:00:00Z',
    findings,
    stats: {
      chunkCount: 10,
      tableChunkCount: 1,
      medianChunkChars: 700,
      sectionPathShare: null,
      overlapShare: 0,
    },
  },
});
function show(children: ReactNode, enabled = true) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OrgFeaturesProvider
        features={{ ...DEFAULT_FEATURES, documentDiagnostics: enabled }}
      >
        {children}
      </OrgFeaturesProvider>
    </NextIntlClientProvider>,
  );
}
describe('knowledge list cells', () => {
  it('distinguishes unavailable, empty, processing and populated coverage', () => {
    show(
      <>
        <BrainCoverageCell file={file} />
        <BrainCoverageCell
          file={{ ...file, brainCoverage: { approved: 2, candidates: 3 } }}
        />
        <BrainCoverageCell
          file={{ ...file, brainCoverage: { approved: 0, candidates: 0 } }}
        />
        <BrainCoverageCell
          file={{
            ...file,
            embeddingStatus: 'STARTED',
            brainCoverage: { approved: 0, candidates: 0 },
          }}
        />
      </>,
    );
    expect(screen.getByText('Brain unavailable')).toBeInTheDocument();
    expect(screen.getByText('2 approved · 3 to review')).toBeInTheDocument();
    expect(screen.getByText('No knowledge')).toBeInTheDocument();
    expect(screen.getByText('Awaiting extraction')).toBeInTheDocument();
  });
  it('never claims OK without a computed diagnostic report', () => {
    show(<ChatQualityCell file={file} status="Queued" />);
    expect(screen.getByText('Not checked')).toBeInTheDocument();
    expect(screen.queryByText('OK')).not.toBeInTheDocument();
  });
  it('shows OK for a checked document without warnings', () => {
    show(
      <ChatQualityCell
        file={{ ...file, metadata: report([]) }}
        status="Queued"
      />,
    );
    expect(screen.getByText('OK')).toBeInTheDocument();
  });
  it('offers optimization for prose warnings without triggering the row preview', () => {
    const preview = vi.fn();
    const optimize = vi.fn();
    show(
      <div onClick={preview}>
        <ChatQualityCell
          file={{
            ...file,
            metadata: report([{ check: 'markup', severity: 'warn' }]),
          }}
          status="Queued"
          onOptimize={optimize}
        />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Optimize' }));
    expect(optimize).toHaveBeenCalledWith(['file']);
    expect(preview).not.toHaveBeenCalled();
  });
  it('hides diagnostics and optimization when the key is off', () => {
    show(
      <ChatQualityCell
        file={{
          ...file,
          metadata: report([{ check: 'markup', severity: 'warn' }]),
        }}
        status="Queued"
        onOptimize={vi.fn()}
      />,
      false,
    );
    expect(screen.getByText('Not checked')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Optimize' }),
    ).not.toBeInTheDocument();
  });
});
