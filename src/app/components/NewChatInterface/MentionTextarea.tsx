'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Textarea } from '@ragenai/common-ui/Textarea';
import { ProjectMentionDropdown } from './ProjectMentionDropdown';
import { validateTextFile } from '@/app/lib/utils/fileValidation';
import { type ThreadDocumentUI } from '@/features/documents/contracts/document.types';
import { statusToast } from '@/app/lib/utils/toast';
import { logger } from '@/app/lib/utils/logger';
import { KnowledgeBasePickerDialog } from '@/app/components/KnowledgeBasePickerDialog';
import { GoogleDrivePickerDialog } from '@/app/components/GoogleDrivePickerDialog';
import { FirefliesPickerDialog } from '@/app/components/FirefliesPickerDialog';
import {
  isDriveConnected,
  getDriveFileContent,
} from '@/app/actions/google-drive';
import { isFirefliesConnected } from '@/app/actions/fireflies';
import {
  extractDriveLinksFromText,
  getDriveFileTypeFromUrl,
} from '@/app/lib/utils/google-drive-url';
import { toast } from 'sonner';
import {
  PlusIcon,
  ArrowUpTrayIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import type { ComponentPropsWithRef } from 'react';
export interface MentionedProject {
  publicId: string;
  title: string;
  id?: number;
}

interface MentionTextareaProps extends ComponentPropsWithRef<typeof Textarea> {
  onProjectMention?: (project: MentionedProject | null) => void;
  mentionedProject?: MentionedProject | null;
  threadDocuments?: ThreadDocumentUI[];
  onThreadDocumentsChange?: (documents: ThreadDocumentUI[]) => void;
  hideAttachments?: boolean;
}

export const MentionTextarea: React.FC<MentionTextareaProps> = ({
  onProjectMention,
  mentionedProject,
  threadDocuments: externalThreadDocuments,
  onThreadDocumentsChange,
  hideAttachments = false,
  value = '',
  onChange,
  ...textareaProps
}) => {
  const tAttach = useTranslations('prompt-attachments');
  const [showDropdown, setShowDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const [isKbPickerOpen, setIsKbPickerOpen] = useState(false);
  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
  const [isFirefliesPickerOpen, setIsFirefliesPickerOpen] = useState(false);
  const [hasDriveConnector, setHasDriveConnector] = useState(false);
  const [hasFirefliesConnector, setHasFirefliesConnector] = useState(false);

  const threadDocuments = externalThreadDocuments ?? [];
  const setThreadDocuments = onThreadDocumentsChange ?? (() => {});
  const mentionStartRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loadingDriveLinks, setLoadingDriveLinks] = useState<
    { id: string; typeLabel: string }[]
  >([]);
  const attachedDriveFileIds = useRef<Set<string>>(new Set());
  const threadDocumentsRef = useRef(threadDocuments);
  threadDocumentsRef.current = threadDocuments;

  const { errorToast } = statusToast();
  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const cursorPos = e.target.selectionStart ?? 0;

      onChange?.(e);

      setCursorPosition(cursorPos);

      const textBeforeCursor = newValue.slice(0, cursorPos);
      const mentionMatch = textBeforeCursor.match(/@([^@\s]*?)$/);

      if (mentionMatch) {
        setMentionQuery(mentionMatch[1]);
        setShowDropdown(true);
        mentionStartRef.current = textBeforeCursor.lastIndexOf('@');
      } else {
        setShowDropdown(false);
        setMentionQuery('');
        mentionStartRef.current = null;
      }

      if (
        mentionedProject &&
        !newValue.includes(`@${mentionedProject.title}`)
      ) {
        onProjectMention?.(null);
      }
    },
    [onChange, mentionedProject, onProjectMention],
  );

  const handleProjectSelect = useCallback(
    (project: MentionedProject) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      const currentValue = textarea.value;
      let currentCursorPos = textarea.selectionStart ?? cursorPosition;
      if (currentCursorPos === 0 && cursorPosition > 0) {
        currentCursorPos = cursorPosition;
      }

      const mentionStartIndex = mentionStartRef.current;
      if (mentionStartIndex === null) {
        return;
      }

      const mentionEndIndex = mentionStartIndex + 1 + mentionQuery.length;

      const newValue =
        currentValue.slice(0, mentionStartIndex) +
        `@${project.title}` +
        currentValue.slice(mentionEndIndex);
      const newCursorPos = mentionStartIndex + project.title.length + 1;

      const syntheticEvent = {
        target: { ...textarea, value: newValue },
        currentTarget: { ...textarea, value: newValue },
      } as unknown as React.ChangeEvent<HTMLTextAreaElement>;

      onChange?.(syntheticEvent);

      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        setCursorPosition(newCursorPos);
      });

      onProjectMention?.(project);
      setShowDropdown(false);
      setMentionQuery('');
    },
    [cursorPosition, onChange, onProjectMention, mentionQuery],
  );

  // File handling
  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          resolve(event.target.result as string);
        } else {
          reject(new Error('Failed to read file content'));
        }
      };
      reader.onerror = () =>
        reject(new Error(`Failed to read file: ${file.name}`));
      reader.readAsText(file, 'UTF-8');
    });
  };

  const handleFilesDrop = useCallback(
    async (files: File[]) => {
      const validFiles: File[] = [];

      for (const file of files) {
        const validation = validateTextFile(file);
        if (validation.valid) {
          validFiles.push(file);
        } else {
          logger.error({ validation }, 'Error validating file');
          errorToast({
            message: validation.error || 'Błąd podczas wgrywania plików',
          });
        }
      }

      try {
        const { uploadFiles } = await import('@/app/lib/services/api');

        const formData = new FormData();
        validFiles.forEach((file) => {
          formData.append('files', file);
        });
        formData.append('thread_specific', 'true');

        const uploadResponse = await uploadFiles(formData);

        const newDocuments: ThreadDocumentUI[] = [];
        for (let i = 0; i < validFiles.length; i++) {
          const file = validFiles[i];
          const uploadedFile = uploadResponse.files[i];
          try {
            const content = await readFileAsText(file);
            newDocuments.push({
              name: uploadedFile.fileName,
              content: content.trim(),
              size: uploadedFile.fileSize,
              type: file.type || 'text/plain',
              userFileId: uploadedFile.uniqueFileId,
            });
          } catch (error) {
            logger.error({ error }, `Error reading file ${file.name}`);
            errorToast({ message: `Błąd odczytu pliku ${file.name}` });
          }
        }

        setThreadDocuments([...threadDocuments, ...newDocuments]);
      } catch (error) {
        errorToast({ message: 'Błąd podczas wgrywania plików' });
      }
    },
    [threadDocuments, setThreadDocuments],
  );

  const handleThreadDocumentRemove = useCallback(
    (index: number) => {
      const removed = threadDocuments[index];
      if (removed?.driveFileId) {
        attachedDriveFileIds.current.delete(removed.driveFileId);
      }
      setThreadDocuments(threadDocuments.filter((_, i) => i !== index));
    },
    [threadDocuments, setThreadDocuments],
  );

  const handleKbFilesSelected = useCallback(
    (
      files: {
        publicId: string;
        name: string;
        size: number;
        type: string;
      }[],
    ) => {
      const newDocs: ThreadDocumentUI[] = files.map((f) => ({
        name: f.name,
        content: '',
        size: f.size,
        type: f.type,
        userFileId: f.publicId,
      }));
      setThreadDocuments([...threadDocuments, ...newDocs]);
    },
    [threadDocuments, setThreadDocuments],
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFilesDrop(files);
    }
    e.target.value = '';
  };

  useEffect(() => {
    isDriveConnected()
      .then(setHasDriveConnector)
      .catch(() => setHasDriveConnector(false));
    isFirefliesConnected()
      .then(setHasFirefliesConnector)
      .catch(() => setHasFirefliesConnector(false));
  }, []);

  const handleDriveFileSelected = useCallback(
    (doc: ThreadDocumentUI) => {
      setThreadDocuments([...threadDocuments, doc]);
    },
    [threadDocuments, setThreadDocuments],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!hasDriveConnector || hideAttachments) {
        return;
      }

      const pastedText = e.clipboardData.getData('text/plain');
      const driveLinks = extractDriveLinksFromText(pastedText);

      if (driveLinks.length === 0) {
        return;
      }

      const newLinks = driveLinks.filter(
        (link) => !attachedDriveFileIds.current.has(link.fileId),
      );

      if (newLinks.length === 0) {
        return;
      }

      e.preventDefault();

      const loadingItems = newLinks.map((link) => ({
        id: link.fileId,
        typeLabel: getDriveFileTypeFromUrl(link.url),
      }));
      setLoadingDriveLinks((prev) => [...prev, ...loadingItems]);

      for (const link of newLinks) {
        attachedDriveFileIds.current.add(link.fileId);
      }

      for (const link of newLinks) {
        getDriveFileContent(link.fileId)
          .then((result) => {
            if (result.success && result.content) {
              const doc: ThreadDocumentUI = {
                name: result.name || 'Google Drive Document',
                content: result.content,
                size: result.content.length,
                type: result.mime_type || 'text/plain',
                sourceUrl: link.url,
                driveFileId: link.fileId,
              };
              setThreadDocuments([...threadDocumentsRef.current, doc]);
            } else {
              attachedDriveFileIds.current.delete(link.fileId);
              toast.error('Failed to fetch Google Drive file');
            }
          })
          .catch(() => {
            attachedDriveFileIds.current.delete(link.fileId);
            toast.error('Failed to fetch Google Drive file');
          })
          .finally(() => {
            setLoadingDriveLinks((prev) =>
              prev.filter((item) => item.id !== link.fileId),
            );
          });
      }
    },
    [hasDriveConnector, hideAttachments, setThreadDocuments],
  );

  const excludeFileIds = threadDocuments
    .filter((d) => d.userFileId)
    .map((d) => d.userFileId!);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (showDropdown) {
        if (e.key === 'Escape') {
          setShowDropdown(false);
          setMentionQuery('');
          e.preventDefault();
          return;
        }

        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          return;
        }
      }

      textareaProps.onKeyDown?.(e);
    },
    [showDropdown, textareaProps],
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (textareaRef.current?.contains(target)) {
        return;
      }
      if (target.closest('[data-project-dropdown]')) {
        return;
      }
      setShowDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative">
      <Textarea
        {...textareaProps}
        ref={textareaRef}
        value={value}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        showFileAttachment={false}
        onFilesDrop={hideAttachments ? undefined : handleFilesDrop}
        threadDocuments={hideAttachments ? undefined : threadDocuments}
        onThreadDocumentRemove={
          hideAttachments ? undefined : handleThreadDocumentRemove
        }
        loadingDocuments={hideAttachments ? undefined : loadingDriveLinks}
        onPasteIntercept={hideAttachments ? undefined : handlePaste}
        leftAddonPosition="bottom"
        leftAddon={
          hideAttachments ? undefined : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center justify-center text-foreground/70 hover:text-foreground transition-colors"
                  aria-label="Add attachment"
                >
                  <PlusIcon className="size-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side="top"
                className="w-52 p-2"
              >
                <DropdownMenuItem
                  className="py-2.5"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ArrowUpTrayIcon className="size-4" />
                  {tAttach('upload-file')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="py-2.5"
                  onClick={() => setIsKbPickerOpen(true)}
                >
                  <BookOpenIcon className="size-4" />
                  {tAttach('from-knowledge-base')}
                </DropdownMenuItem>
                {hasDriveConnector && (
                  <DropdownMenuItem
                    className="py-2.5"
                    onClick={() => setIsDrivePickerOpen(true)}
                  >
                    <img
                      src="/assets/connectors/google-drive.svg"
                      alt="Google Drive"
                      className="size-4"
                    />
                    {tAttach('from-google-drive')}
                  </DropdownMenuItem>
                )}
                {hasFirefliesConnector && (
                  <DropdownMenuItem
                    className="py-2.5"
                    onClick={() => setIsFirefliesPickerOpen(true)}
                  >
                    <img
                      src="/assets/connectors/fireflies.svg"
                      alt="Fireflies"
                      className="size-4"
                    />
                    {tAttach('from-fireflies')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />

      {!hideAttachments && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.srt,.txt,.pdf,.epub"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />

          <KnowledgeBasePickerDialog
            open={isKbPickerOpen}
            onOpenChange={setIsKbPickerOpen}
            onFilesSelected={handleKbFilesSelected}
            excludeFileIds={excludeFileIds}
          />

          <GoogleDrivePickerDialog
            open={isDrivePickerOpen}
            onOpenChange={setIsDrivePickerOpen}
            onFileSelected={handleDriveFileSelected}
          />

          <FirefliesPickerDialog
            open={isFirefliesPickerOpen}
            onOpenChange={setIsFirefliesPickerOpen}
            onFileSelected={handleDriveFileSelected}
          />
        </>
      )}

      {showDropdown && (
        <ProjectMentionDropdown
          query={mentionQuery}
          onSelect={handleProjectSelect}
          onClose={() => {
            setShowDropdown(false);
            setMentionQuery('');
          }}
        />
      )}
    </div>
  );
};
