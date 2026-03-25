import {
  forwardRef,
  useImperativeHandle,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { validateTextFile } from '@/app/lib/utils/fileValidation';
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

import { zodResolver } from '@hookform/resolvers/zod';

import { AskQuestion } from './';
import {
  ChatType,
  type CreateMessageDto,
  type ChatResponseType,
  createMessageSchema,
} from '@/features/messages/contracts/message.types';
import type { ThreadDocumentUI } from '@/features/documents/contracts/document.types';
import { KnowledgeBasePickerDialog } from '@/app/components/KnowledgeBasePickerDialog';
import { GoogleDrivePickerDialog } from '@/app/components/GoogleDrivePickerDialog';
import { FirefliesPickerDialog } from '@/app/components/FirefliesPickerDialog';
import {
  isDriveConnected,
  getDriveFileContent,
} from '@/app/actions/google-drive';
import { isFirefliesConnected } from '@/app/actions/fireflies';
import { toast } from 'sonner';
import {
  extractDriveLinksFromText,
  getDriveFileTypeFromUrl,
} from '@/app/lib/utils/google-drive-url';

type Props = {
  isLoading: boolean;
  isUserLogged: boolean;
  isPublicAccess?: boolean;
  onSubmit: SubmitHandler<CreateMessageDto>;
  responseType: ChatResponseType;
};

export type PromptFormRef = {
  reset: (prompt?: string) => void;
};

export const PromptForm = forwardRef<PromptFormRef, Props>(
  (
    { isLoading, isUserLogged, onSubmit, isPublicAccess, responseType },
    ref,
  ) => {
    const t = useTranslations('form');
    const tAttach = useTranslations('prompt-attachments');
    const pathname = usePathname();
    const [threadDocuments, setThreadDocuments] = useState<ThreadDocumentUI[]>(
      [],
    );
    const [isKbPickerOpen, setIsKbPickerOpen] = useState(false);
    const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
    const [isFirefliesPickerOpen, setIsFirefliesPickerOpen] = useState(false);
    const [hasDriveConnector, setHasDriveConnector] = useState(false);
    const [hasFirefliesConnector, setHasFirefliesConnector] = useState(false);
    const [loadingDriveLinks, setLoadingDriveLinks] = useState<
      { id: string; typeLabel: string }[]
    >([]);
    const attachedDriveFileIds = useRef<Set<string>>(new Set());
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
      if (!isPublicAccess) {
        isDriveConnected()
          .then(setHasDriveConnector)
          .catch(() => setHasDriveConnector(false));
        isFirefliesConnected()
          .then(setHasFirefliesConnector)
          .catch(() => setHasFirefliesConnector(false));
      }
    }, [isPublicAccess, pathname]);

    const {
      register,
      reset,
      handleSubmit,
      formState: { errors },
      watch,
      setValue,
    } = useForm<CreateMessageDto>({
      resolver: zodResolver(createMessageSchema(t)),
      reValidateMode: 'onSubmit',
    });

    useImperativeHandle(ref, () => ({
      reset: (prompt) => reset({ prompt }),
    }));

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

    const handleFilesDrop = useCallback(async (files: File[]) => {
      const validFiles: File[] = [];

      for (const file of files) {
        const validation = validateTextFile(file);
        if (validation.valid) {
          validFiles.push(file);
        }
      }

      const newDocuments: ThreadDocumentUI[] = [];
      for (const file of validFiles) {
        try {
          const content = await readFileAsText(file);
          newDocuments.push({
            name: file.name,
            content: content.trim(),
            size: file.size,
            type: file.type || 'text/plain',
          });
        } catch {
          // TODO: Show error toast for file read error
        }
      }

      setThreadDocuments((prev) => [...prev, ...newDocuments]);
    }, []);

    const handleThreadDocumentRemove = useCallback((index: number) => {
      setThreadDocuments((prev) => {
        const removed = prev[index];
        if (removed?.driveFileId) {
          attachedDriveFileIds.current.delete(removed.driveFileId);
        }
        return prev.filter((_, i) => i !== index);
      });
    }, []);

    const handleExternalDocumentSelected = useCallback(
      (doc: ThreadDocumentUI) => {
        setThreadDocuments((prev) => [...prev, doc]);
      },
      [],
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
        setThreadDocuments((prev) => [...prev, ...newDocs]);
      },
      [],
    );

    const handlePaste = useCallback(
      (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        if (!hasDriveConnector) {
          return;
        }

        const pastedText = e.clipboardData.getData('text/plain');
        const driveLinks = extractDriveLinksFromText(pastedText);

        if (driveLinks.length === 0) {
          return;
        }

        // Filter out already-attached files
        const newLinks = driveLinks.filter(
          (link) => !attachedDriveFileIds.current.has(link.fileId),
        );

        if (newLinks.length === 0) {
          return;
        }

        // Prevent the paste from inserting the URL into the textarea
        e.preventDefault();

        // Add loading placeholders
        const loadingItems = newLinks.map((link) => ({
          id: link.fileId,
          typeLabel: getDriveFileTypeFromUrl(link.url),
        }));
        setLoadingDriveLinks((prev) => [...prev, ...loadingItems]);

        // Mark as in-flight to prevent duplicates
        for (const link of newLinks) {
          attachedDriveFileIds.current.add(link.fileId);
        }

        // Fetch content for each file
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
                setThreadDocuments((prev) => [...prev, doc]);
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
      [hasDriveConnector],
    );

    const handleFormSubmit: SubmitHandler<CreateMessageDto> = async (data) => {
      reset({ prompt: '' });
      onSubmit({
        ...data,
        mode: ChatType.RAG,
        messageType: responseType,
        voiceDurationSeconds: data.voiceDurationSeconds,
        threadDocuments:
          threadDocuments.length > 0 ? threadDocuments : undefined,
      });
      setThreadDocuments([]);
      attachedDriveFileIds.current.clear();
    };

    const handleSend = () => {
      handleSubmit(handleFormSubmit)();
    };

    const promptValue = watch('prompt', '');

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        handleFilesDrop(files);
      }
      e.target.value = '';
    };

    const excludeFileIds = threadDocuments
      .filter((d) => d.userFileId)
      .map((d) => d.userFileId!);

    return (
      <div className="w-full px-4 pb-4 pt-2 bg-gradient-to-t from-background via-background to-transparent">
        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="flex flex-col max-w-3xl mx-auto"
        >
          <AskQuestion
            isUserLogged={isUserLogged}
            disabled={isLoading}
            error={errors?.prompt}
            register={register}
            onSend={handleSend}
            value={promptValue}
            showVoiceInput={!isPublicAccess}
            setPromptValue={(text: string) => setValue('prompt', text)}
            showFileAttachment={false}
            onFilesDrop={isPublicAccess ? undefined : handleFilesDrop}
            threadDocuments={isPublicAccess ? undefined : threadDocuments}
            onThreadDocumentRemove={
              isPublicAccess ? undefined : handleThreadDocumentRemove
            }
            loadingDocuments={isPublicAccess ? undefined : loadingDriveLinks}
            onPasteIntercept={isPublicAccess ? undefined : handlePaste}
            textareaClassName=""
            leftAddon={
              !isPublicAccess ? (
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
              ) : undefined
            }
          />
        </form>

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
          onFileSelected={handleExternalDocumentSelected}
        />

        <FirefliesPickerDialog
          open={isFirefliesPickerOpen}
          onOpenChange={setIsFirefliesPickerOpen}
          onFileSelected={handleExternalDocumentSelected}
        />
      </div>
    );
  },
);

PromptForm.displayName = 'PromptForm';
