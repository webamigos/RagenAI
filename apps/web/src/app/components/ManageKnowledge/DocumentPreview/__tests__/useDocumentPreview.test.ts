import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useDocumentPreview } from '../hooks/useDocumentPreview';
import type { UserFileTypeSafe } from '../../UserFiles/FileList/UserFilesTable';
import { EmbeddingStatus } from '@/generated/prisma/browser';

const makeFile = (id: string): UserFileTypeSafe => ({
  id,
  organizationId: 'org1',
  fileName: `file-${id}.pdf`,
  fileSize: 1000,
  fileType: 'PDF',
  projectId: 'proj1',
  project: null,
  embeddingStatus: EmbeddingStatus.COMPLETED,
  embeddingStartedAt: null,
  embeddingCompletedAt: null,
  embeddingFailedAt: null,
});

const files = [makeFile('a'), makeFile('b'), makeFile('c')];

describe('useDocumentPreview', () => {
  it('zwraca contentUrl gdy isOpen=true', () => {
    const onFileChange = vi.fn();
    const { result } = renderHook(() =>
      useDocumentPreview({
        file: files[1],
        files,
        initialIndex: 1,
        isOpen: true,
        onFileChange,
      }),
    );
    expect(result.current.contentUrl).toBe('/api/files/b');
  });

  it('zwraca pusty contentUrl gdy isOpen=false (lazy load)', () => {
    const onFileChange = vi.fn();
    const { result } = renderHook(() =>
      useDocumentPreview({
        file: files[1],
        files,
        initialIndex: 1,
        isOpen: false,
        onFileChange,
      }),
    );
    expect(result.current.contentUrl).toBe('');
  });

  it('canGoNext false dla ostatniego pliku', () => {
    const onFileChange = vi.fn();
    const { result } = renderHook(() =>
      useDocumentPreview({
        file: files[2],
        files,
        initialIndex: 2,
        isOpen: true,
        onFileChange,
      }),
    );
    expect(result.current.canGoNext).toBe(false);
    expect(result.current.canGoPrev).toBe(true);
  });

  it('canGoPrev false dla pierwszego pliku', () => {
    const onFileChange = vi.fn();
    const { result } = renderHook(() =>
      useDocumentPreview({
        file: files[0],
        files,
        initialIndex: 0,
        isOpen: true,
        onFileChange,
      }),
    );
    expect(result.current.canGoPrev).toBe(false);
    expect(result.current.canGoNext).toBe(true);
  });

  it('goNext wywołuje onFileChange z następnym plikiem', () => {
    const onFileChange = vi.fn();
    const { result } = renderHook(() =>
      useDocumentPreview({
        file: files[0],
        files,
        initialIndex: 0,
        isOpen: true,
        onFileChange,
      }),
    );
    act(() => {
      result.current.goNext();
    });
    expect(onFileChange).toHaveBeenCalledWith(files[1], 1);
  });

  it('goPrev wywołuje onFileChange z poprzednim plikiem', () => {
    const onFileChange = vi.fn();
    const { result } = renderHook(() =>
      useDocumentPreview({
        file: files[2],
        files,
        initialIndex: 2,
        isOpen: true,
        onFileChange,
      }),
    );
    act(() => {
      result.current.goPrev();
    });
    expect(onFileChange).toHaveBeenCalledWith(files[1], 1);
  });
});
