'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { XMarkIcon } from '@heroicons/react/24/outline';

import { getFileIcon } from '@/app/lib/constants/fileIcons';
import { fileTypeFromName } from '@/app/components/ManageKnowledge/DocumentPreview/viewers/file-type-from-name';
import type { RetrievalSource } from '@/store/assistant/assistantSlice';

/**
 * Loaded when a reader opens a source, not when a thread renders.
 *
 * The viewers behind this pull pdf.js and mammoth — well over a megabyte of
 * parser — and every answer in every thread mounts this component. A static
 * import would put that in the chat bundle for a panel most turns never open.
 * `ssr: false` because pdf.js needs a DOM: it reaches for `DOMMatrix` at
 * module scope.
 */
const ViewerForType = dynamic(
  () =>
    import('@/app/components/ManageKnowledge/DocumentPreview/viewers/ViewerForType').then(
      (module) => module.ViewerForType,
    ),
  { ssr: false },
);

type Props = {
  source: RetrievalSource | null;
  onClose: () => void;
};

/**
 * The document behind a citation, opened at the passage the answer used.
 *
 * This is the end of the chain the worker started: Docling reports a box per
 * text element, the anchor walk carries it onto the chunk, the chunk carries it
 * onto the retrieved source, and here it becomes a rectangle over a rendered
 * page. Before it, checking a citation meant leaving the thread, finding the
 * file in the knowledge base and reading until you found the paragraph.
 *
 * **Not `DocumentPreviewSlideOver`.** That component is built around
 * `UserFileTypeSafe` — a full database record — and carries a metadata sidebar
 * with delete, share and move. A cited source has a file id, a name, a page and
 * some rectangles; fetching a record to satisfy a prop type would add a guarded
 * read for data this panel does not show, and offering "delete document" beside
 * a citation is not the action a reader is reaching for. What is shared is the
 * part worth sharing: `ViewerForType` and the viewers under it.
 *
 * **No new read path.** The content comes from `/api/files/{id}`, which already
 * guards on `organizationId` *and* `fileAccessWhere(actor)` — tenancy and
 * authorization as two separate conditions. A reader who cannot download the
 * file sees the viewer's error state, which is the correct outcome rather than
 * a leak.
 *
 * **The highlight can point at unmasked text.** Where PII was masked, the chunk
 * the answer read says `[PESEL]` and the page underneath says the number. That
 * is not new exposure — the same reader can already download that PDF through
 * the same route — but it is a decision: a rectangle can lead someone to text
 * the chunk deliberately masked.
 */

export function CitedSourcePreview({ source, onClose }: Props) {
  const t = useTranslations('document-preview');

  useEffect(() => {
    if (!source) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [source, onClose]);

  if (!source) {
    return null;
  }

  const fileName = source.fileName ?? source.fileId;
  const fileType = fileTypeFromName(fileName);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={fileName}
    >
      <div
        data-testid="cited-source-overlay"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      <div className="relative flex h-full w-[90vw] max-w-4xl flex-col bg-card shadow-2xl dark:bg-muted">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
          <span className="inline-flex size-6 shrink-0 items-center">
            {getFileIcon(fileType)}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
            title={fileName}
          >
            {fileName}
          </span>
          <button
            onClick={onClose}
            aria-label={t('close')}
            className="rounded p-1.5 text-muted-foreground hover:bg-muted dark:hover:bg-paper-700"
          >
            <XMarkIcon className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {/*
            The page and the regions come from the same chunk, so the view
            opens where the quote came from. Both are guarded the same way they
            are on the card: a value that arrived over the network and is not a
            page anyone can turn to is dropped rather than passed on.
          */}
          <ViewerForType
            fileType={fileType}
            fileId={source.fileId}
            fileName={fileName}
            contentUrl={`/api/files/${source.fileId}`}
            initialPage={
              typeof source.sourcePage === 'number' &&
              Number.isInteger(source.sourcePage) &&
              source.sourcePage >= 1
                ? source.sourcePage
                : undefined
            }
            highlights={source.sourceRegions}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
