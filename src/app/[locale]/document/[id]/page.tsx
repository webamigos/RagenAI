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
import { deleteDocument } from '@/app/actions';
import { uploadFiles } from '@/app/lib/services/api';

const turndownService = new TurndownService();
const mdParser = new MarkdownIt();

type DocumentPageProps = {
  params: {
    locale: string;
    id: string;
  };
};

type State = {
  documentContent: string | null;
  documentTitle: string | null;
  isLoading: boolean;
  isEditing: boolean;
  editableContent: string | null;
  isEditingTitle: boolean;
  editableTitle: string | null;
  isSaving: boolean;
};

type Action =
  | { type: 'SET_DOCUMENT'; payload: { content: string; title: string } }
  | { type: 'SET_EDITING'; payload: boolean }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_EDITABLE_CONTENT'; payload: string }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_EDITABLE_TITLE'; payload: string | null }
  | { type: 'SET_DOCUMENT_TITLE'; payload: string }
  | { type: 'SET_EDITING_TITLE'; payload: boolean };

const initialState: State = {
  documentContent: null,
  documentTitle: null,
  isLoading: true,
  isEditing: false,
  editableContent: null,
  isEditingTitle: false,
  editableTitle: null,
  isSaving: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_DOCUMENT':
      return {
        ...state,
        documentContent: action.payload.content,
        documentTitle: action.payload.title,
        isLoading: false,
      };
    case 'SET_EDITING':
      return { ...state, isEditing: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_EDITABLE_CONTENT':
      return { ...state, editableContent: action.payload };
    case 'SET_SAVING':
      return { ...state, isSaving: action.payload };
    case 'SET_EDITABLE_TITLE':
      return { ...state, editableTitle: action.payload };
    case 'SET_DOCUMENT_TITLE':
      return { ...state, documentTitle: action.payload };
    case 'SET_EDITING_TITLE':
      return { ...state, isEditingTitle: action.payload };
    default:
      return state;
  }
}

export default function DocumentPage({ params }: DocumentPageProps) {
  const { id } = params;
  const { organization } = useOrganization();
  const t = useTranslations('document-preview');

  const [state, dispatch] = useReducer(reducer, initialState);
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

  const searchParams = useSearchParams();
  const isEditMode = searchParams.get('edit') === 'true';

  const { errorToast, successToast } = statusToast();
  const orgId = organization?.id.toLowerCase();

  useEffect(() => {
    if (id && orgId) {
      const loadDocument = async () => {
        dispatch({ type: 'SET_LOADING', payload: true });

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
              type: 'SET_DOCUMENT',
              payload: { content: documentText, title: documentTitle },
            });

            if (isEditMode) {
              dispatch({ type: 'SET_EDITING', payload: true });
              const htmlContent = mdParser.render(documentText || '');
              dispatch({ type: 'SET_EDITABLE_CONTENT', payload: htmlContent });
            }
          } else {
            errorToast({ message: `${content.message}: ${content.error}` });
          }
        } catch (error) {
          errorToast({ message: t('fetching-error') });
        } finally {
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      };

      loadDocument();
    }
  }, [id, orgId, isEditMode]);

  const handleDoubleClick = () => {
    dispatch({ type: 'SET_EDITING', payload: true });
    const htmlContent = mdParser.render(documentContent || '');
    dispatch({ type: 'SET_EDITABLE_CONTENT', payload: htmlContent });
  };

  const handleTitleDoubleClick = () => {
    dispatch({ type: 'SET_EDITING_TITLE', payload: true });
    dispatch({ type: 'SET_EDITABLE_TITLE', payload: documentTitle });
  };

  const handleSave = async () => {
    if (!orgId || !editableContent || !documentTitle) return;
    dispatch({ type: 'SET_SAVING', payload: true });

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
      new File([markdownContent], `${documentTitle}.md`, {
        type: 'text/markdown',
      })
    );
    formData.append('organizationId', organization!.id);

    await deleteDocument(orgId, id);
    await uploadFiles(orgId, formData);

    if (response.success) {
      dispatch({
        type: 'SET_DOCUMENT',
        payload: { content: markdownContent, title: documentTitle },
      });
      successToast({ message: t('edit-successfully') });
    } else {
      errorToast({ message: response.message });
    }
    dispatch({ type: 'SET_EDITING', payload: false });
    dispatch({ type: 'SET_SAVING', payload: false });
  };

  const handleEditTitle = async () => {
    if (!orgId || editableTitle === null) return;
    const response = await updateDocument({
      orgId,
      documentId: id,
      title: editableTitle,
    });

    if (response.success) {
      dispatch({ type: 'SET_DOCUMENT_TITLE', payload: editableTitle });
    } else {
      errorToast({ message: response.message });
    }
    dispatch({ type: 'SET_EDITING_TITLE', payload: false });
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
              dispatch({ type: 'SET_EDITABLE_TITLE', payload: e.target.value })
            }
            onBlur={handleEditTitle}
            onKeyDown={handleTitleKeyDown}
            className="w-full mb-4 p-2 text-2xl font-bold"
            autoFocus
          />
        </div>
      ) : (
        <Text
          className="mb-4 text-2xl font-bold cursor-pointer"
          onDoubleClick={handleTitleDoubleClick}
        >
          {documentTitle}
        </Text>
      )}

      {isEditing ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto">
            <WysiwygEditor
              value={editableContent || ''}
              onChange={(content) =>
                dispatch({ type: 'SET_EDITABLE_CONTENT', payload: content })
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
