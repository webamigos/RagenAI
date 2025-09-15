'use client';

import React, { useEffect, useReducer } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useOrganization } from '@clerk/nextjs';
import MarkdownIt from 'markdown-it';
import TurndownService from 'turndown';
import { useTranslations } from 'next-intl';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import { statusToast } from '@/app/lib/utils/toast';
import {
  SpinnerSVG,
  WysiwygEditor,
  Text,
  Input,
  Button,
  CloudArrowUp,
  XMarkIcon,
} from '@ragenai/common-ui';
import {
  fetchDocumentByOrganization,
  updateDocument,
} from '@/app/components/ManageKnowledge/MarkdownDocumentsCreator/action';
import { deleteFileAction } from '@/app/actions';
import { uploadFiles } from '@/app/lib/services/api';
import { ArrowLeftCircleIcon } from '@heroicons/react/24/outline';
import { initialState, reducer } from './documentReducer';

const turndownService = new TurndownService();
const mdParser = new MarkdownIt();

type Props = {
  publicId: string;
};

export function DocumentComponent({ publicId }: Props) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const {
    documentContent,
    documentTitle,
    isEditing,
    isEditingTitle,
    isLoading,
    isSaving,
  } = state;

  const { organization } = useOrganization();
  const { push } = useRouter();
  const t = useTranslations('document-preview');
  const searchParams = useSearchParams();
  const isEditMode = searchParams.get('edit') === 'true';
  const { errorToast, successToast } = statusToast();
  const orgId = organization?.id;

  const documentSchema = z.object({
    content: z.string().min(1, { message: t('content-empty') }),
  });

  const titleSchema = z.object({
    title: z.string().min(1, { message: t('title-empty') }),
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
    push(`/document/${publicId}?edit=true`);
  };

  const handleTitleDoubleClick = () => {
    dispatch({ type: 'SET_IS_EDITING_TITLE', payload: true });
    resetTitle({
      title: documentTitle,
    });
  };

  const onSubmit = async (data: { content: string }) => {
    if (!orgId) return;
    dispatch({ type: 'SET_IS_SAVING', payload: true });

    const markdownContent = turndownService.turndown(data.content);

    const response = await updateDocument({
      orgId,
      documentId: publicId,
      content: markdownContent,
      title: documentTitle,
    });

    const formData = new FormData();
    formData.append(
      'files',
      new File([markdownContent], `${documentTitle}`, {
        type: 'text/markdown',
      })
    );
    formData.append('organizationId', organization!.id);

    await deleteFileAction(publicId);
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
    if (!orgId) return;
    dispatch({ type: 'SET_IS_SAVING', payload: true });

    const response = await updateDocument({
      orgId,
      documentId: publicId,
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
    const currentPath = window.location.pathname;
    push(currentPath);
  };

  useEffect(() => {
    if (publicId && orgId) {
      const loadDocument = async () => {
        dispatch({ type: 'SET_IS_LOADING', payload: true });

        try {
          const content = await fetchDocumentByOrganization(orgId, publicId);
          if (content.success) {
            const documentText = content.documents
              .map((doc) => doc.content)
              .join('\n');
            const title = content.documents
              .map((document) => document.title)
              .join('\n');

            dispatch({ type: 'SET_DOCUMENT_CONTENT', payload: documentText });
            dispatch({ type: 'SET_DOCUMENT_TITLE', payload: title });

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
  }, [publicId, orgId, isEditMode]);

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
    <>
      <div className="relative top-16 lg:top-0 w-full h-16 flex items-center justify-between ml-4 lg:ml-0 overflow-auto bg-primary-light dark:bg-primary-dark">
        <div className="flex items-center">
          {!isEditMode && (
            <ArrowLeftCircleIcon
              onClick={() => push('/manage-knowledge/documents-list')}
              className="h-8 w-8 cursor-pointer mr-2"
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
        </div>
      </div>
      {isEditing ? (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col w-full flex-1"
        >
          <div className="flex-1 overflow-auto mx-3 lg:ml-0">
            <Controller
              name="content"
              control={control}
              render={({ field }) => (
                <WysiwygEditor
                  value={field.value}
                  onChange={field.onChange}
                  className="flex-1 prose prose-lg dark:prose-invert"
                />
              )}
            />
            {errors.content && (
              <span className="text-red-500">{errors.content.message}</span>
            )}
          </div>
          <div className="flex my-4 gap-2">
            <Button
              type="submit"
              disabled={
                isSaving ||
                turndownService.turndown(watchedContent) === documentContent
              }
              isLoading={isSaving}
              iconRight={<CloudArrowUp />}
              className={`w-full md:w-auto flex justify-center self-center`}
            >
              {t('save')}
            </Button>
            <Button
              type="button"
              onClick={handleEditLeave}
              disabled={isSaving}
              iconRight={<XMarkIcon />}
              className={`w-full md:w-auto flex justify-center self-center`}
            >
              {t('cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <div
          className="flex-1 prose prose-lg dark:prose-invert max-w-none w-full"
          onDoubleClick={handleDoubleClick}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {documentContent}
          </ReactMarkdown>
        </div>
      )}
    </>
  );
}
