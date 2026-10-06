import { describe, expect, it, vi } from 'vitest';
import {
  knowledgeListIssues,
  optimizationEligible,
  requestDocumentOptimizations,
} from '../knowledge-list-issues';
import type { UserFileType } from '../../contracts/document.types';
const file = (overrides: Partial<UserFileType> = {}): UserFileType => ({
  id: 'file',
  organizationId: 'org',
  fileName: 'policy.docx',
  fileSize: 10,
  fileType: 'DOCX',
  projectId: null,
  project: null,
  embeddingStatus: 'COMPLETED',
  document: { id: 'doc' },
  ...overrides,
});
const metadata = {
  diagnostics: {
    version: 1,
    computedAt: '2026-10-06T12:00:00Z',
    findings: [{ check: 'table-without-header', severity: 'warn' }],
    stats: {
      chunkCount: 10,
      tableChunkCount: 1,
      medianChunkChars: 700,
      sectionPathShare: null,
      overlapShare: 0,
    },
  },
};
describe('knowledge list attention', () => {
  it('does not treat unavailable Brain coverage or processing as empty knowledge', () => {
    const empty = file({ brainCoverage: { approved: 0, candidates: 0 } });
    const report = knowledgeListIssues(
      [
        empty,
        file(),
        file({
          embeddingStatus: 'STARTED',
          brainCoverage: { approved: 0, candidates: 0 },
        }),
        file({ brainCoverage: { approved: 0, candidates: 1 } }),
      ],
      true,
    );
    expect(report.noKnowledge).toEqual([empty]);
  });
  it('honours diagnostics flag and checks warnings', () => {
    const table = file({ metadata });
    expect(knowledgeListIssues([table], true).headerless).toEqual([table]);
    expect(knowledgeListIssues([table], false).headerless).toEqual([]);
  });
  it('refuses spreadsheets, mostly tabular and unprocessed documents', () => {
    expect(optimizationEligible(file())).toBe(true);
    expect(optimizationEligible(file({ fileType: 'XLSX' }))).toBe(false);
    expect(optimizationEligible(file({ document: null }))).toBe(false);
    expect(optimizationEligible(file({ embeddingStatus: 'STARTED' }))).toBe(
      false,
    );
    expect(
      optimizationEligible(
        file({
          metadata: {
            diagnostics: {
              ...metadata.diagnostics,
              stats: { ...metadata.diagnostics.stats, tableChunkCount: 9 },
            },
          },
        }),
      ),
    ).toBe(false);
  });
  it('uses existing guarded endpoint once per document and returns partial results', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false })
      .mockRejectedValueOnce(new Error('network'));
    expect(
      await requestDocumentOptimizations(
        ['one', 'one', 'two', 'three'],
        request,
      ),
    ).toEqual([
      { id: 'one', ok: true },
      { id: 'two', ok: false },
      { id: 'three', ok: false },
    ]);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls[0]).toEqual([
      '/api/documents/one/optimize-suggestions',
      { method: 'POST' },
    ]);
  });
});
