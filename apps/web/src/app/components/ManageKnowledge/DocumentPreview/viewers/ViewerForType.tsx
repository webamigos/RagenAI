'use client';

import type { SourceRegion } from '@ragenai/rag-core';

import type { FileType } from '@/generated/prisma/browser';
import { PdfViewer } from './PdfViewer';
import { DocxViewer } from './DocxViewer';
import { XlsxViewer } from './XlsxViewer';
import { MarkdownViewer } from './MarkdownViewer';
import { PlainTextViewer } from './PlainTextViewer';
import { ImageViewer } from './ImageViewer';
import { UnsupportedViewer } from './UnsupportedViewer';
import { UrlSourceViewer, urlFromSourceName } from './UrlSourceViewer';

/**
 * Picks the viewer for a file.
 *
 * Lived inside `DocumentPreviewSlideOver` until the chat needed it too. That
 * component is built around `UserFileTypeSafe` — a full database record, with
 * a metadata sidebar and delete/share/move actions — and a cited source in a
 * thread has a file id and a name. Importing the slide-over to reach this
 * function would have dragged the knowledge base's table types into the chat
 * bundle for a switch statement.
 */
export function ViewerForType({
  fileType,
  fileId,
  fileName,
  contentUrl,
  initialPage,
  highlights,
  passage,
}: {
  fileType: FileType;
  fileId: string;
  fileName: string;
  contentUrl: string;
  /** PDF only: the page to open at. Ignored by every other viewer. */
  initialPage?: number;
  /** PDF only: the regions to highlight. Ignored by every other viewer. */
  highlights?: SourceRegion[];
  /**
   * The passage a citation quoted — the chunk's text. Every text-bearing
   * viewer marks it and scrolls to it, and says so when it cannot find it.
   * Absent when the file is opened from the knowledge base.
   */
  passage?: string;
}) {
  // A scraped page is stored as `URL`, named `<url> | <mode>`, and has no
  // file of its own to render; the quote and a way back to the page do.
  const sourceUrl =
    fileType === 'URL' || fileType === 'UNKNOWN'
      ? urlFromSourceName(fileName)
      : null;
  if (sourceUrl) {
    return <UrlSourceViewer url={sourceUrl} passage={passage} />;
  }
  if (fileType === 'PDF') {
    return (
      <PdfViewer
        contentUrl={contentUrl}
        initialPage={initialPage}
        highlights={highlights}
        passage={passage}
      />
    );
  }
  if (fileType === 'DOCX') {
    return <DocxViewer contentUrl={contentUrl} passage={passage} />;
  }
  if (fileType === 'XLSX') {
    return <XlsxViewer contentUrl={contentUrl} passage={passage} />;
  }
  if (fileType === 'MARKDOWN') {
    return <MarkdownViewer contentUrl={contentUrl} passage={passage} />;
  }
  if (fileType === 'TEXT' || fileType === 'CSV') {
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith('.docx') || lowerName.endsWith('.doc')) {
      return <DocxViewer contentUrl={contentUrl} passage={passage} />;
    }
    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      return <XlsxViewer contentUrl={contentUrl} passage={passage} />;
    }
    if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
      return <MarkdownViewer contentUrl={contentUrl} passage={passage} />;
    }
    return <PlainTextViewer contentUrl={contentUrl} passage={passage} />;
  }
  if (fileType === 'IMAGE') {
    return <ImageViewer contentUrl={contentUrl} fileName={fileName} />;
  }
  return (
    <UnsupportedViewer fileId={fileId} fileName={fileName} passage={passage} />
  );
}
