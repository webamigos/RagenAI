'use client';

import React, { useEffect, useMemo, useReducer, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import { useOrganization } from '@/app/hooks/use-auth';
// @ts-ignore -- UMD bundle has no type declarations
import MarkdownIt from 'markdown-it/dist/markdown-it.js';
import TurndownService from 'turndown';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';
import { useTranslations } from 'next-intl';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { statusToast } from '@/app/lib/utils/toast';
import { SpinnerSVG, CloudArrowUp, XMarkIcon } from '@ragenai/common-ui/icons';
import { WysiwygEditor } from '@ragenai/common-ui/WysywigEditor';
import { Text } from '@ragenai/common-ui/Text';
import { Input } from '@ragenai/common-ui/Input';
import { Button } from '@ragenai/common-ui/Button';
import {
  fetchDocumentByOrganization,
  updateDocument,
} from '@/app/components/ManageKnowledge/MarkdownDocumentsCreator/action';
import { deleteFileAction } from '@/app/actions';
import { uploadFiles } from '@/app/lib/services/api';
import {
  ArrowLeftCircleIcon,
  ArrowTopRightOnSquareIcon,
  ArrowDownTrayIcon,
  DocumentIcon,
} from '@heroicons/react/24/outline';
import { initialState, reducer } from './documentReducer';
import { PdfViewer } from './PdfViewer';

import 'highlight.js/styles/github-dark.css';
import '@/app/components/Assistant/ChatOutput/chat-response.css';
import './document-preview.css';

const createMarkdownRenderer = () => {
  return new MarkdownIt({
    highlight: (code: string, lang: string) => {
      try {
        const highlighted =
          lang && hljs.getLanguage(lang)
            ? hljs.highlight(code, { language: lang }).value
            : hljs.highlightAuto(code).value;
        return `<div class="code-wrapper"><pre class="hljs"><code>${highlighted}</code></pre></div>`;
      } catch {
        return code;
      }
    },
  });
};

const turndownService = new TurndownService();
const mdParser = new MarkdownIt();

type Props = {
  documentId: string;
};

export function DocumentComponent({ documentId }: Props) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const md = useMemo(() => createMarkdownRenderer(), []);

  const {
    documentContent,
    documentTitle,
    isEditing,
    isEditingTitle,
    isLoading,
    isSaving,
    showPdfPanel,
    pdfFileId,
  } = state;

  const { organization } = useOrganization();
  const { push } = useRouter();
  const t = useTranslations('document-preview');
  const searchParams = useSearchParams();
  const isEditModeRef = useRef(searchParams.get('edit') === 'true');
  const isEditMode = isEditModeRef.current;
  const { errorToast, successToast } = statusToast();
  const orgId = organization?.id;

  const documentSchema = z.object({
    content: z.string().min(1, { error: t('content-empty') }),
  });

  const titleSchema = z.object({
    title: z.string().min(1, { error: t('title-empty') }),
  });

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(documentSchema),
    defaultValues: {
      content: '',
    },
  });
  const watchedContent = watch('content');

  const {
    register: registerTitle,
    handleSubmit: handleSubmitTitle,
    reset: resetTitle,
    formState: { errors: errorsTitle },
  } = useForm({
    resolver: zodResolver(titleSchema),
    defaultValues: {
      title: '',
    },
  });

  const handleDoubleClick = () => {
    dispatch({ type: 'SET_IS_EDITING', payload: true });
    reset({
      content: mdParser.render(documentContent || ''),
    });
    // Rebuilt from the current URL rather than from the pathname alone: the
    // old form dropped every other query parameter and the fragment.
    const url = new URL(window.location.href);
    url.searchParams.set('edit', 'true');
    window.history.replaceState(null, '', url.toString());
  };

  const handleTitleDoubleClick = () => {
    dispatch({ type: 'SET_IS_EDITING_TITLE', payload: true });
    resetTitle({
      title: documentTitle,
    });
  };

  const onSubmit = async (data: { content: string }) => {
    if (!orgId) {
      return;
    }
    dispatch({ type: 'SET_IS_SAVING', payload: true });

    const markdownContent = turndownService.turndown(data.content);

    const response = await updateDocument({
      documentId,
      content: markdownContent,
      title: documentTitle,
    });

    const formData = new FormData();
    formData.append(
      'files',
      new File([markdownContent], `${documentTitle}`, {
        type: 'text/markdown',
      }),
    );
    formData.append('organizationId', organization!.id);

    await deleteFileAction(documentId);
    await uploadFiles(formData);

    if (response.success) {
      dispatch({ type: 'SET_DOCUMENT_CONTENT', payload: markdownContent });
      successToast({ message: t('edit-successfully') });
    } else {
      errorToast({ message: response.message });
    }
    dispatch({ type: 'SET_IS_EDITING', payload: false });
    dispatch({ type: 'SET_IS_SAVING', payload: false });
  };

  const onTitleSubmit = async (data: { title: string }) => {
    if (!orgId) {
      return;
    }
    dispatch({ type: 'SET_IS_SAVING', payload: true });

    const response = await updateDocument({
      documentId,
      title: data.title,
    });

    if (response.success) {
      dispatch({ type: 'SET_DOCUMENT_TITLE', payload: data.title });
    } else {
      errorToast({ message: response.message });
    }
    dispatch({ type: 'SET_IS_EDITING_TITLE', payload: false });
    dispatch({ type: 'SET_IS_SAVING', payload: false });
  };

  const handleEditLeave = () => {
    dispatch({ type: 'SET_IS_EDITING', payload: false });
    reset({
      content: mdParser.render(documentContent || ''),
    });
    // Only the edit flag is dropped; anything else in the query string or the
    // fragment was not ours to remove.
    const url = new URL(window.location.href);
    url.searchParams.delete('edit');
    window.history.replaceState(null, '', url.toString());
  };

  useEffect(() => {
    if (documentId && orgId) {
      const loadDocument = async () => {
        dispatch({ type: 'SET_IS_LOADING', payload: true });

        try {
          const content = await fetchDocumentByOrganization(documentId);
          if (content.success) {
            const documentText = content.documents
              .map((doc) => doc.content)
              .join('\n');
            const title = content.documents
              .map((document) => document.title)
              .join('\n');

            dispatch({ type: 'SET_DOCUMENT_CONTENT', payload: documentText });
            dispatch({ type: 'SET_DOCUMENT_TITLE', payload: title });

            const firstDoc = content.documents[0];
            if (firstDoc?.file?.fileType === 'PDF' && firstDoc.file.id) {
              dispatch({
                type: 'SET_PDF_FILE_ID',
                payload: firstDoc.file.id,
              });
            }

            reset({
              content: mdParser.render(documentText || ''),
            });

            resetTitle({
              title: title,
            });

            if (isEditMode) {
              dispatch({ type: 'SET_IS_EDITING', payload: true });
            }
          } else {
            errorToast({ message: `${content.message}: ${content.error}` });
          }
        } catch (error) {
          errorToast({ message: t('fetching-error') });
        } finally {
          dispatch({ type: 'SET_IS_LOADING', payload: false });
        }
      };

      loadDocument();
    }
    // isEditMode intentionally omitted — URL change via replaceState must not retrigger load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, orgId]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center align-middle">
        <SpinnerSVG />
      </div>
    );
  }
  if (!documentContent) {
    return (
      <div className="h-screen flex items-center justify-center align-middle">
        <Text>{t('document-not-found')}</Text>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="w-full h-16 flex items-center justify-between px-4 border-b border-zinc-200 dark:border-zinc-700">
        <div className="flex items-center">
          {!isEditMode && (
            <ArrowLeftCircleIcon
              onClick={() => push('/knowledge/documents-list')}
              className="h-7 w-7 cursor-pointer mr-2 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 stroke-1"
            />
          )}
          {isEditingTitle ? (
            <form
              className="flex mb-4 flex-1 justify-center align-middle items-center"
              onSubmit={handleSubmitTitle(onTitleSubmit)}
            >
              <Input
                type="text"
                {...registerTitle('title')}
                onBlur={handleSubmitTitle(onTitleSubmit)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmitTitle(onTitleSubmit)();
                  }
                }}
                autoFocus
                className="py-1 max-w-96 min-w-24	text-md md:text-xl font-bold bg-transparent outline-hidden"
              />
              {errorsTitle.title && (
                <span className="text-red-500">
                  {errorsTitle.title.message}
                </span>
              )}
            </form>
          ) : (
            <Text
              className="truncate text-md md:text-xl flex-wrap font-bold cursor-pointer hover:cursor-text hover:border-primary-blue-400 p-2 rounded border border-transparent box-border"
              onClick={handleTitleDoubleClick}
            >
              {documentTitle}
            </Text>
          )}
          {!isEditing && (
            <div className="ml-1 flex items-center gap-0.5">
              {pdfFileId && (
                <a
                  href={`/api/files/${pdfFileId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  title="Open in new tab"
                >
                  <ArrowTopRightOnSquareIcon className="size-4 text-zinc-400" />
                </a>
              )}
              {pdfFileId ? (
                <a
                  href={`/api/files/${pdfFileId}`}
                  download
                  className="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  title="Download"
                >
                  <ArrowDownTrayIcon className="size-4 text-zinc-400" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([documentContent], {
                      type: 'text/markdown',
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${documentTitle || 'document'}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  title="Download"
                >
                  <ArrowDownTrayIcon className="size-4 text-zinc-400" />
                </button>
              )}
              {pdfFileId && (
                <button
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: 'SET_SHOW_PDF_PANEL',
                      payload: !showPdfPanel,
                    })
                  }
                  className={`rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${showPdfPanel ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
                  title={showPdfPanel ? 'Hide PDF preview' : 'Show PDF preview'}
                >
                  <DocumentIcon className="size-4 text-zinc-400" />
                </button>
              )}
            </div>
          )}
        </div>
        {isEditing && (
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              form="document-edit-form"
              disabled={
                isSaving ||
                turndownService.turndown(watchedContent) === documentContent
              }
              isLoading={isSaving}
              iconRight={<CloudArrowUp />}
              className="flex justify-center"
            >
              {t('save')}
            </Button>
            <Button
              type="button"
              onClick={handleEditLeave}
              disabled={isSaving}
              iconRight={<XMarkIcon />}
              className="flex justify-center"
            >
              {t('cancel')}
            </Button>
          </div>
        )}
      </div>
      {isEditing && (
        <form
          id="document-edit-form"
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col w-full flex-1 min-h-0"
        >
          <div className="flex-1 overflow-auto px-6 py-4">
            <Controller
              name="content"
              control={control}
              render={({ field }) => (
                <WysiwygEditor
                  value={field.value}
                  onChange={field.onChange}
                  className="prose prose-lg dark:prose-invert max-w-none min-h-[60vh] w-full"
                />
              )}
            />
            {errors.content && (
              <span className="text-red-500 text-sm">
                {errors.content.message}
              </span>
            )}
          </div>
        </form>
      )}
      {!isEditing && showPdfPanel && pdfFileId && (
        <div className="flex flex-1 overflow-hidden">
          <div
            className="w-1/2 overflow-auto px-6 py-8 lg:px-10 border-r border-zinc-200 dark:border-zinc-700"
            onDoubleClick={handleDoubleClick}
          >
            <div
              className="chat-response document-preview"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(md.render(documentContent)),
              }}
            />
          </div>
          <div className="w-1/2 overflow-hidden">
            <PdfViewer fileId={pdfFileId} />
          </div>
        </div>
      )}
      {!isEditing && !(showPdfPanel && pdfFileId) && (
        <div
          className="flex-1 w-full overflow-auto px-6 py-8 lg:px-12"
          onDoubleClick={handleDoubleClick}
        >
          <div
            className="chat-response document-preview max-w-5xl"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(md.render(documentContent)),
            }}
          />
        </div>
      )}
    </div>
  );
}
