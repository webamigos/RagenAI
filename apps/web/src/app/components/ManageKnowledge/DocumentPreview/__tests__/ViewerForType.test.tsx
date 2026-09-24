import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import type { FileType } from '@/generated/prisma/browser';

// Each viewer is replaced by its name: what is under test is the choice, not
// the rendering — and the real ones pull in pdf.js, mammoth and SheetJS.
// The mocks print the passage they were handed, which is what proves the
// switch passes it on to every viewer that can mark text.
const { named } = vi.hoisted(() => ({
  named:
    (name: string) =>
    ({ passage }: { passage?: string }) =>
      `${name}${passage ? ` passage=${passage}` : ''}`,
}));

vi.mock('../viewers/PdfViewer', () => ({ PdfViewer: named('PDF') }));
vi.mock('../viewers/DocxViewer', () => ({ DocxViewer: named('DOCX') }));
vi.mock('../viewers/XlsxViewer', () => ({ XlsxViewer: named('XLSX') }));
vi.mock('../viewers/MarkdownViewer', () => ({
  MarkdownViewer: named('MARKDOWN'),
}));
vi.mock('../viewers/PlainTextViewer', () => ({
  PlainTextViewer: named('TEXT'),
}));
vi.mock('../viewers/UrlSourceViewer', () => ({
  UrlSourceViewer: ({ url }: { url: string }) => <div>URL {url}</div>,
  urlFromSourceName: (name: string) =>
    name.startsWith('https://') ? name.split(' | ')[0] : null,
}));
vi.mock('../viewers/ImageViewer', () => ({
  ImageViewer: () => <div>IMAGE</div>,
}));
vi.mock('../viewers/UnsupportedViewer', () => ({
  UnsupportedViewer: () => <div>UNSUPPORTED</div>,
}));

import { ViewerForType } from '../viewers/ViewerForType';

function show(fileType: FileType, fileName: string, passage?: string) {
  render(
    <ViewerForType
      fileType={fileType}
      fileId="file-1"
      fileName={fileName}
      contentUrl="/api/files/file-1"
      passage={passage}
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

  it.each<[FileType, string, string]>([
    ['PDF', 'umowa.pdf', 'PDF'],
    ['DOCX', 'raport.docx', 'DOCX'],
    ['XLSX', 'cennik.xlsx', 'XLSX'],
    ['MARKDOWN', 'notatki.md', 'MARKDOWN'],
    ['TEXT', 'notatki.txt', 'TEXT'],
    ['CSV', 'dane.csv', 'TEXT'],
  ])(
    'passes the cited passage to the %s viewer',
    (fileType, fileName, name) => {
      show(fileType, fileName, 'cytat');
      expect(screen.getByText(`${name} passage=cytat`)).toBeInTheDocument();
    },
  );

  it('shows a scraped page as its passage and a link, not the placeholder', () => {
    show('URL', 'https://example.com/pricing | scrape', 'cytat');
    expect(
      screen.getByText('URL https://example.com/pricing'),
    ).toBeInTheDocument();
    expect(screen.queryByText('UNSUPPORTED')).not.toBeInTheDocument();
  });

  it('recognises a scraped page by its name when the type is unknown', () => {
    // The chat derives the type from the file name, and a URL has no
    // extension, so a cited web page arrives here as UNKNOWN.
    show('UNKNOWN', 'https://example.com/pricing | crawl');
    expect(
      screen.getByText('URL https://example.com/pricing'),
    ).toBeInTheDocument();
  });
});
