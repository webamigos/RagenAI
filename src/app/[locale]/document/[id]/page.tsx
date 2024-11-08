'use client';

import React, { useEffect, useReducer } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useOrganization } from '@clerk/nextjs';
import MarkdownIt from 'markdown-it';
import TurndownService from 'turndown';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { statusToast } from '@/app/lib/utils/toast';
import {
  SpinnerSVG,
  WysiwygEditor,
  Text,
  Input,
  Button,
} from '@salesyy/common-ui';
import {
  fetchDocumentByOrganization,
  updateDocument,
} from '@/app/components/MarkdownDocumentsCreator/action';
import { deleteDocumentAction } from '@/app/actions';
import { uploadFiles } from '@/app/lib/services/api';
import {
  reducer,
  initialState,
  State,
  Action,
  SET_DOCUMENT,
  SET_LOADING,
  SET_EDITING,
  SET_SAVING,
  SET_EDITABLE_CONTENT,
  SET_DOCUMENT_TITLE,
  EDIT_TITLE_MODE,
} from './documentReducer';

const turndownService = new TurndownService();
const mdParser = new MarkdownIt();

type DocumentPageProps = {
  params: {
    locale: string;
    id: string;
  };
};

export default function DocumentPage({ params }: DocumentPageProps) {
  const [state, dispatch] = useReducer(reducer, initialState) as [
    State,
    React.Dispatch<Action>
  ];

  const {
    documentContent,
    documentTitle,
    isLoading,
    isEditing,
    editableContent,
    isEditingTitle,
    editableTitle,
    isSaving,
  } = state;

  const { id } = params;
  const { organization } = useOrganization();
  const t = useTranslations('document-preview');
  const searchParams = useSearchParams();
  const isEditMode = searchParams.get('edit') === 'true';
  const { errorToast, successToast } = statusToast();
  const orgId = organization?.id.toLowerCase();

  useEffect(() => {
    if (id && orgId) {
      const loadDocument = async () => {
        dispatch({ type: SET_LOADING, payload: true });

        try {
          const content = await fetchDocumentByOrganization(orgId, id);
          if (content.success) {
            const documentText = content.documents
              .map((doc) => doc.content)
              .join('\n');
            const documentTitle = content.documents
              .map((document) => document.title)
              .join('\n');

            dispatch({
              type: SET_DOCUMENT,
              payload: { content: documentText, title: documentTitle },
            });

            if (isEditMode) {
              dispatch({ type: SET_EDITING, payload: true });
              const htmlContent = mdParser.render(documentText || '');
              dispatch({ type: SET_EDITABLE_CONTENT, payload: htmlContent });
            }
          } else {
            errorToast({ message: `${content.message}: ${content.error}` });
          }
        } catch (error) {
          errorToast({ message: t('fetching-error') });
        } finally {
          dispatch({ type: SET_LOADING, payload: false });
        }
      };

      loadDocument();
    }
  }, [id, orgId, isEditMode]);

  const handleDoubleClick = () => {
    dispatch({ type: SET_EDITING, payload: true });
    const htmlContent = mdParser.render(documentContent || '');
    dispatch({ type: SET_EDITABLE_CONTENT, payload: htmlContent });
  };

  const handleTitleDoubleClick = () => {
    dispatch({
      type: EDIT_TITLE_MODE,
      payload: { isEditing: true, title: documentTitle },
    });
  };

  const handleSave = async () => {
    if (!orgId || !editableContent || !documentTitle) return;
    dispatch({ type: SET_SAVING, payload: true });

    const markdownContent = turndownService.turndown(editableContent);
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
      dispatch({
        type: SET_DOCUMENT,
        payload: { content: markdownContent, title: documentTitle },
      });
      successToast({ message: t('edit-successfully') });
    } else {
      errorToast({ message: response.message });
    }
    dispatch({ type: SET_EDITING, payload: false });
    dispatch({ type: SET_SAVING, payload: false });
  };

  const handleEditTitle = async () => {
    if (!orgId || editableTitle === null) return;
    const response = await updateDocument({
      orgId,
      documentId: id,
      title: editableTitle,
    });

    if (response.success) {
      dispatch({ type: SET_DOCUMENT_TITLE, payload: editableTitle });
    } else {
      errorToast({ message: response.message });
    }
    dispatch({
      type: EDIT_TITLE_MODE,
      payload: { isEditing: false, title: null },
    });
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleEditTitle();
    }
  };

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
        <div className="w-full">
          <Input
            type="text"
            value={editableTitle || ''}
            onChange={(e) =>
              dispatch({
                type: EDIT_TITLE_MODE,
                payload: { isEditing: true, title: e.target.value },
              })
            }
            onBlur={handleEditTitle}
            onKeyDown={handleTitleKeyDown}
            className="w-full mb-4 p-2 text-2xl font-bold"
            autoFocus
          />
        </div>
      ) : (
        <Text
          className="mb-4 text-2xl font-bold cursor-pointer hover:cursor-text hover:border-primary-blue-400 p-2 rounded border border-transparent box-border"
          onClick={handleTitleDoubleClick}
        >
          {documentTitle}
        </Text>
      )}
      {isEditing ? (
        <div className="flex flex-col w-full flex-1">
          <div className="flex-1 overflow-auto">
            <WysiwygEditor
              value={editableContent || ''}
              onChange={(content) =>
                dispatch({ type: SET_EDITABLE_CONTENT, payload: content })
              }
              className="flex-1"
            />
          </div>
          <div className="mt-2">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              isLoading={isSaving}
              className={`bg-blue-500 text-white py-2 px-4 w-full md:w-auto self-center ${
                isSaving ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {t('save')}
            </Button>
          </div>
        </div>
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
