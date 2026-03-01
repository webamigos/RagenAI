import {
  forwardRef,
  useImperativeHandle,
  useState,
  useCallback,
  useRef,
} from 'react';
import { useTranslations } from 'next-intl';
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

type Props = {
  isLoading: boolean;
  isUserLogged: boolean;
  handleResponseType?: () => void;
  isPublicAccess?: boolean;
  onSubmit: SubmitHandler<CreateMessageDto>;
  responseType: ChatResponseType;
};

export type PromptFormRef = {
  reset: (prompt?: string) => void;
};

export const PromptForm = forwardRef<PromptFormRef, Props>(
  (
    {
      isLoading,
      isUserLogged,
      onSubmit,
      isPublicAccess,
      handleResponseType,
      responseType,
    },
    ref,
  ) => {
    const t = useTranslations('form');
    const tAttach = useTranslations('prompt-attachments');
    const [threadDocuments, setThreadDocuments] = useState<ThreadDocumentUI[]>(
      [],
    );
    const [isKbPickerOpen, setIsKbPickerOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

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
      setThreadDocuments((prev) => prev.filter((_, i) => i !== index));
    }, []);

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
            handleResponseType={handleResponseType}
            setPromptValue={(text: string) => setValue('prompt', text)}
            showFileAttachment={false}
            onFilesDrop={handleFilesDrop}
            threadDocuments={threadDocuments}
            onThreadDocumentRemove={handleThreadDocumentRemove}
          />

          {!isPublicAccess && (
            <div className="mt-2 flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center justify-center size-8 rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label="Add attachment"
                  >
                    <PlusIcon className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="w-52">
                  <DropdownMenuItem
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ArrowUpTrayIcon className="size-4" />
                    {tAttach('upload-file')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsKbPickerOpen(true)}>
                    <BookOpenIcon className="size-4" />
                    {tAttach('from-knowledge-base')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
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
      </div>
    );
  },
);

PromptForm.displayName = 'PromptForm';
