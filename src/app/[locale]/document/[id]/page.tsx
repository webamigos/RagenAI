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
import { deleteDocumentAction } from '@/app/actions';
import { uploadFiles } from '@/app/lib/services/api';
import { ArrowLeftCircleIcon } from '@heroicons/react/24/outline';
import { initialState, reducer } from './documentReducer';

const turndownService = new TurndownService();
const mdParser = new MarkdownIt();

type DocumentPageProps = {
  params: {
    locale: string;
    id: string;
  };
};

export default function DocumentPage({ params }: DocumentPageProps) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const {
    documentContent,
    documentTitle,
    isEditing,
    isEditingTitle,
    isLoading,
    isSaving,
  } = state;
  const { id } = params;
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
    push(`/document/${id}?edit=true`);
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
      documentId: id,
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

    await deleteDocumentAction(orgId, id);
    await uploadFiles(orgId, formData);

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
      documentId: id,
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
    if (id && orgId) {
      const loadDocument = async () => {
        dispatch({ type: 'SET_IS_LOADING', payload: true });

        try {
          const content = await fetchDocumentByOrganization(orgId, id);
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
  }, [id, orgId, isEditMode]);

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
    <div className="h-full flex flex-col items-center flex-1 overflow-auto px-4">
      {isEditingTitle ? (
        <form onSubmit={handleSubmitTitle(onTitleSubmit)} className="w-full">
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
            className="w-full mb-4 p-2 text-2xl font-bold"
            autoFocus
          />
          {errorsTitle.title && (
            <span className="text-red-500">{errorsTitle.title.message}</span>
          )}
        </form>
      ) : (
        <div className={`w-full flex -ml-5`}>
          {!isEditMode && (
            <div className="w-1/4">
              <ArrowLeftCircleIcon
                onClick={() => push('/manage-knowledge/documents-list')}
                className="h-8 w-8 mt-3 cursor-pointer"
              />
            </div>
          )}
          <Text
            className="mb-4 -ml-1 text-2xl font-bold cursor-pointer hover:cursor-text hover:border-primary-blue-400 p-2 rounded border border-transparent box-border"
            onClick={handleTitleDoubleClick}
          >
            {documentTitle}
          </Text>
        </div>
      )}
      {isEditing ? (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col w-full flex-1"
        >
          <div className="flex-1 overflow-auto">
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
          <div className="mt-4">
            <Button
              type="submit"
              disabled={
                isSaving ||
                turndownService.turndown(watchedContent) === documentContent
              }
              isLoading={isSaving}
              iconRight={<CloudArrowUp />}
              className={`mr-2 w-full md:w-auto self-center`}
            >
              {t('save')}
            </Button>
            <Button
              type="button"
              onClick={handleEditLeave}
              disabled={isSaving}
              iconRight={<XMarkIcon />}
              className={`w-full md:w-auto self-center
                }`}
            >
              {t('cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <div
          className="flex-1 prose justify-center prose-lg dark:prose-invert"
          onDoubleClick={handleDoubleClick}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {documentContent}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
