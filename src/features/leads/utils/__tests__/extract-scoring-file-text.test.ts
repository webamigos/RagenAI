import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetFileFromS3 = vi.fn();
vi.mock('@/app/lib/services/storage', () => ({
  getFileFromS3: (...a: unknown[]) => mockGetFileFromS3(...a),
}));

const mockPdfParse = vi.fn();
vi.mock('pdf-parse', () => ({
  default: (...a: unknown[]) => mockPdfParse(...a),
}));

const mockMammoth = vi.fn();
vi.mock('mammoth', () => ({
  default: { extractRawText: (...a: unknown[]) => mockMammoth(...a) },
}));

import { extractScoringFileText } from '../extract-scoring-file-text';
import { FileType } from '@/generated/prisma/client';

const pdfFile = {
  id: 'file-uuid',
  fileName: 'scoring.pdf',
  fileType: FileType.PDF,
  organizationId: 'org-1',
};
const docxFile = {
  id: 'file-uuid',
  fileName: 'scoring.docx',
  fileType: FileType.UNKNOWN,
  organizationId: 'org-1',
  fileExtension: 'docx',
};

beforeEach(() => vi.clearAllMocks());

describe('extractScoringFileText', () => {
  it('extracts text from PDF via pdf-parse', async () => {
    const buf = Buffer.from('fake-pdf');
    mockGetFileFromS3.mockResolvedValue(buf);
    mockPdfParse.mockResolvedValue({ text: 'Scoring criteria text' });

    const result = await extractScoringFileText(pdfFile as any);

    expect(mockGetFileFromS3).toHaveBeenCalledWith('scoring.pdf');
    expect(result).toBe('Scoring criteria text');
  });

  it('extracts text from DOCX via mammoth', async () => {
    const buf = Buffer.from('fake-docx');
    mockGetFileFromS3.mockResolvedValue(buf);
    mockMammoth.mockResolvedValue({ value: 'Scoring criteria text' });

    const result = await extractScoringFileText(docxFile as any);

    expect(mockMammoth).toHaveBeenCalledWith({ buffer: buf });
    expect(result).toBe('Scoring criteria text');
  });

  it('throws when PDF text is empty', async () => {
    mockGetFileFromS3.mockResolvedValue(Buffer.from('x'));
    mockPdfParse.mockResolvedValue({ text: '   ' });

    await expect(extractScoringFileText(pdfFile as any)).rejects.toThrow(
      'Could not extract text from scoring file',
    );
  });

  it('throws for unsupported file type', async () => {
    const xlsxFile = {
      ...pdfFile,
      fileType: FileType.XLSX,
      fileExtension: 'xlsx',
    };
    mockGetFileFromS3.mockResolvedValue(Buffer.from('x'));

    await expect(extractScoringFileText(xlsxFile as any)).rejects.toThrow(
      'Unsupported scoring file type',
    );
  });
});
