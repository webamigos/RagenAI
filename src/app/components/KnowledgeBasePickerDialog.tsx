'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  MagnifyingGlassIcon,
  DocumentIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getAllOrgFiles } from '@/app/actions';

type KnowledgeFile = {
  public_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  created_at: Date;
  project: { id: number; title: string } | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFilesSelected: (
    files: { publicId: string; name: string; size: number; type: string }[],
  ) => void;
  excludeFileIds?: string[];
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const KnowledgeBasePickerDialog = ({
  open,
  onOpenChange,
  onFilesSelected,
  excludeFileIds = [],
}: Props) => {
  const t = useTranslations('knowledge-picker');
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getAllOrgFiles();
      setFiles(result.files as KnowledgeFile[]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadFiles();
      setSelectedIds(new Set());
      setSearch('');
    }
  }, [open, loadFiles]);

  const filteredFiles = files.filter((file) => {
    if (excludeFileIds.includes(file.public_id)) return false;
    if (!search) return true;
    return file.file_name.toLowerCase().includes(search.toLowerCase());
  });

  const toggleFile = (fileId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const selected = files
      .filter((f) => selectedIds.has(f.public_id))
      .map((f) => ({
        publicId: f.public_id,
        name: f.file_name,
        size: f.file_size,
        type: f.file_type,
      }));
    onFilesSelected(selected);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search-placeholder')}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="max-h-64 overflow-y-auto -mx-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-zinc-400" />
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {search ? t('no-results') : t('no-files')}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {filteredFiles.map((file) => {
                const isSelected = selectedIds.has(file.public_id);
                return (
                  <button
                    key={file.public_id}
                    type="button"
                    onClick={() => toggleFile(file.public_id)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <DocumentIcon className="size-5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{file.file_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatFileSize(file.file_size)}
                        {file.project && (
                          <span className="ml-2">{file.project.title}</span>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <CheckIcon className="size-4 shrink-0 text-blue-500" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={selectedIds.size === 0}>
            {t('add-selected', { count: selectedIds.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
