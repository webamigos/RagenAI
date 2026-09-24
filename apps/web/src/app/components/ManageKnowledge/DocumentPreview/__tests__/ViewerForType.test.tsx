import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import type { FileType } from '@/generated/prisma/browser';

// Each viewer is replaced by its name: what is under test is the choice, not
// the rendering — and the real ones pull in pdf.js, mammoth and SheetJS.
vi.mock('../viewers/PdfViewer', () => ({ PdfViewer: () => <div>PDF</div> }));
vi.mock('../viewers/DocxViewer', () => ({ DocxViewer: () => <div>DOCX</div> }));
vi.mock('../viewers/XlsxViewer', () => ({ XlsxViewer: () => <div>XLSX</div> }));
vi.mock('../viewers/MarkdownViewer', () => ({
  MarkdownViewer: () => <div>MARKDOWN</div>,
}));
vi.mock('../viewers/PlainTextViewer', () => ({
  PlainTextViewer: () => <div>TEXT</div>,
}));
vi.mock('../viewers/ImageViewer', () => ({
  ImageViewer: () => <div>IMAGE</div>,
}));
vi.mock('../viewers/UnsupportedViewer', () => ({
  UnsupportedViewer: () => <div>UNSUPPORTED</div>,
}));

import { ViewerForType } from '../viewers/ViewerForType';

function show(fileType: FileType, fileName: string) {
  render(
    <ViewerForType
      fileType={fileType}
      fileId="file-1"
      fileName={fileName}
      contentUrl="/api/files/file-1"
    />,
  );
}

describe('ViewerForType', () => {
  // #1268: XLSX used to fall through to the unsupported placeholder.
  it('opens an XLSX file in the spreadsheet viewer', () => {
    show('XLSX', 'cennik.xlsx');
    expect(screen.getByText('XLSX')).toBeInTheDocument();
    expect(screen.queryByText('UNSUPPORTED')).not.toBeInTheDocument();
  });

  it.each(['cennik.xlsx', 'stary-cennik.xls'])(
    'opens a spreadsheet stored as TEXT/CSV by its name (%s)',
    (fileName) => {
      show('CSV', fileName);
      expect(screen.getByText('XLSX')).toBeInTheDocument();
    },
  );

  it('still opens a real CSV as text', () => {
    show('CSV', 'dane.csv');
    expect(screen.getByText('TEXT')).toBeInTheDocument();
  });

  it.each<[FileType, string, string]>([
    ['PDF', 'umowa.pdf', 'PDF'],
    ['DOCX', 'raport.docx', 'DOCX'],
    ['MARKDOWN', 'notatki.md', 'MARKDOWN'],
    ['IMAGE', 'zdjecie.png', 'IMAGE'],
    ['EPUB', 'ksiazka.epub', 'UNSUPPORTED'],
  ])('opens %s in its own viewer', (fileType, fileName, expected) => {
    show(fileType, fileName);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
