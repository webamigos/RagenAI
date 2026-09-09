'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { FileType } from '@/generated/prisma/browser';
import type { UserFileTypeSafe } from '../UserFiles/FileList/UserFilesTable';
import { useDocumentPreview } from './hooks/useDocumentPreview';
import { DocumentPreviewHeader } from './DocumentPreviewHeader';
import { DocumentPreviewMetadata } from './DocumentPreviewMetadata';
import { PdfViewer } from './viewers/PdfViewer';
import { DocxViewer } from './viewers/DocxViewer';
import { MarkdownViewer } from './viewers/MarkdownViewer';
import { PlainTextViewer } from './viewers/PlainTextViewer';
import { ImageViewer } from './viewers/ImageViewer';
import { UnsupportedViewer } from './viewers/UnsupportedViewer';

type Props = {
  file: UserFileTypeSafe | null;
  files: UserFileTypeSafe[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onFileChange: (file: UserFileTypeSafe, index: number) => void;
  onDelete: (fileId: string) => void;
  onShare: (fileId: string) => void;
  onMove: (fileId: string) => void;
};

function ViewerForType({
  fileType,
  fileId,
  fileName,
  contentUrl,
}: {
  fileType: FileType;
  fileId: string;
  fileName: string;
  contentUrl: string;
}) {
  if (fileType === 'PDF') {
    return <PdfViewer contentUrl={contentUrl} />;
  }
  if (fileType === 'DOCX') {
    return <DocxViewer contentUrl={contentUrl} />;
  }
  if (fileType === 'MARKDOWN') {
    return <MarkdownViewer contentUrl={contentUrl} />;
  }
  if (fileType === 'TEXT' || fileType === 'CSV') {
    const lowerName = fileName.toLowerCase();
    if (lowerName.endsWith('.docx') || lowerName.endsWith('.doc')) {
      return <DocxViewer contentUrl={contentUrl} />;
    }
    if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
      return <MarkdownViewer contentUrl={contentUrl} />;
    }
    return <PlainTextViewer contentUrl={contentUrl} />;
  }
  if (fileType === 'IMAGE') {
    return <ImageViewer contentUrl={contentUrl} fileName={fileName} />;
  }
  return <UnsupportedViewer fileId={fileId} fileName={fileName} />;
}

export function DocumentPreviewSlideOver({
  file,
  files,
  initialIndex,
  isOpen,
  onClose,
  onFileChange,
  onDelete,
  onShare,
  onMove,
}: Props) {
  const { contentUrl, goNext, goPrev, canGoNext, canGoPrev } =
    useDocumentPreview({
      file: file ?? files[0],
      files,
      initialIndex,
      isOpen,
      onFileChange,
    });

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !file) {
    return null;
  }

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = `/api/files/${file.id}`;
    link.download = file.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div
        data-testid="preview-overlay"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative flex h-full w-[90vw] max-w-5xl flex-col bg-white shadow-2xl dark:bg-muted">
        {/* Header */}
        <DocumentPreviewHeader
          fileName={file.fileName}
          fileType={file.fileType}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          onPrev={goPrev}
          onNext={goNext}
          onClose={onClose}
        />

        {/* Body: viewer 70% + metadata 30% */}
        <div className="flex min-h-0 flex-1">
          {/* Viewer */}
          <div className="min-w-0 flex-1 overflow-hidden">
            <ViewerForType
              fileType={file.fileType}
              fileId={file.id}
              fileName={file.fileName}
              contentUrl={contentUrl}
            />
          </div>

          {/* Metadata sidebar */}
          <div className="hidden w-72 shrink-0 border-l border-border lg:flex lg:flex-col">
            <DocumentPreviewMetadata
              file={file}
              onDownload={handleDownload}
              onShare={() => onShare(file.id)}
              onMove={() => onMove(file.id)}
              onDelete={() => onDelete(file.id)}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
