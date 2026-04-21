'use client';

import { useEffect, useCallback } from 'react';
import type { UserFileTypeSafe } from '../../UserFiles/FileList/UserFilesTable';

type UseDocumentPreviewInput = {
  file: UserFileTypeSafe;
  files: UserFileTypeSafe[];
  initialIndex: number;
  isOpen: boolean;
  onFileChange: (file: UserFileTypeSafe, index: number) => void;
};

type UseDocumentPreviewOutput = {
  contentUrl: string;
  goNext: () => void;
  goPrev: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
  currentIndex: number;
};

export function useDocumentPreview({
  file,
  files,
  initialIndex,
  isOpen,
  onFileChange,
}: UseDocumentPreviewInput): UseDocumentPreviewOutput {
  const currentIndex = initialIndex;
  const canGoNext = currentIndex < files.length - 1;
  const canGoPrev = currentIndex > 0;
  const contentUrl = isOpen ? `/api/files/${file.id}` : '';

  const goNext = useCallback(() => {
    if (canGoNext) {
      onFileChange(files[currentIndex + 1], currentIndex + 1);
    }
  }, [canGoNext, currentIndex, files, onFileChange]);

  const goPrev = useCallback(() => {
    if (canGoPrev) {
      onFileChange(files[currentIndex - 1], currentIndex - 1);
    }
  }, [canGoPrev, currentIndex, files, onFileChange]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        goNext();
      } else if (e.key === 'ArrowLeft') {
        goPrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, goNext, goPrev]);

  return { contentUrl, goNext, goPrev, canGoNext, canGoPrev, currentIndex };
}
