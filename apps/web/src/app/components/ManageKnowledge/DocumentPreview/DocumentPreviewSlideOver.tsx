'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { UserFileTypeSafe } from '../UserFiles/FileList/UserFilesTable';
import { Scrim } from '@/components/ui/scrim';
import { useDocumentPreview } from './hooks/useDocumentPreview';
import { DocumentPreviewHeader } from './DocumentPreviewHeader';
import { DocumentPreviewMetadata } from './DocumentPreviewMetadata';
import { ViewerForType } from './viewers/ViewerForType';
import { fileTypeFromName } from './viewers/file-type-from-name';
import {
  PREVIEW_WIDTH,
  PreviewWidthToggle,
  usePreviewExpanded,
} from './PreviewWidthToggle';

type Props = {
  file: UserFileTypeSafe | null;
  files: UserFileTypeSafe[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onFileChange: (file: UserFileTypeSafe, index: number) => void;
  /** Absent where documents may not be removed; the action is then hidden. */
  onDelete?: (fileId: string) => void;
  onShare: (fileId: string) => void;
  onMove: (fileId: string) => void;
};

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
  const { expanded, toggle } = usePreviewExpanded();

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

  // `fileType` buckets several extensions into one value — a spreadsheet
  // uploaded through some paths is stored as TEXT — so the header showed a
  // markdown icon over a spreadsheet. The extension says what the file is;
  // the stored type is the fallback for a name that has none, like a URL.
  const nameType = fileTypeFromName(file.fileName);
  const displayType = nameType === 'UNKNOWN' ? file.fileType : nameType;

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
      <Scrim data-testid="preview-overlay" onClick={onClose} />

      {/* Panel */}
      <div
        data-testid="preview-panel"
        data-expanded={expanded}
        className={`relative flex h-full flex-col bg-card shadow-2xl dark:bg-muted ${
          expanded
            ? PREVIEW_WIDTH.expanded
            : `${PREVIEW_WIDTH.normal} max-w-5xl`
        }`}
      >
        {/* Header */}
        <DocumentPreviewHeader
          fileName={file.fileName}
          fileType={displayType}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          onPrev={goPrev}
          onNext={goNext}
          onClose={onClose}
          widthToggle={
            <PreviewWidthToggle expanded={expanded} onToggle={toggle} />
          }
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
              onDelete={onDelete ? () => onDelete(file.id) : undefined}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
