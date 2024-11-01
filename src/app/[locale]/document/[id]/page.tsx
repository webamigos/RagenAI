'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useOrganization } from '@clerk/nextjs';
import MarkdownIt from 'markdown-it';
import TurndownService from 'turndown';
import { useRouter, useSearchParams } from 'next/navigation';

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

export default function DocumentPage({ params }: DocumentPageProps) {
  const { id } = params;
  const { organization } = useOrganization();

  const [documentContent, setDocumentContent] = useState<string | null>(null);
  const [documentTitle, setDocumentTitle] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editableContent, setEditableContent] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editableTitle, setEditableTitle] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const isEditMode = searchParams.get('edit') === 'true';
  const router = useRouter();

  const { errorToast } = statusToast();
  const orgId = organization?.id.toLowerCase();

  useEffect(() => {
    if (id && orgId) {
      const loadDocument = async () => {
        setIsLoading(true);

        try {
          const content = await fetchDocumentByOrganization(orgId, id);
          if (content.success) {
            const documentText = content.documents
              .map((doc) => doc.content)
              .join('\n');
            const documentTitle = content.documents
              .map((document) => document.title)
              .join('\n');

            if (isEditMode) {
              setIsEditing(true);
              const htmlContent = mdParser.render(documentText || '');
              setEditableContent(htmlContent);
              setDocumentTitle(documentTitle);
            }
            setDocumentContent(documentText);
            setDocumentTitle(documentTitle);
          } else {
            errorToast({ message: `${content.message}: ${content.error}` });
            setDocumentContent(null);
          }
        } catch (error) {
          errorToast({ message: 'Wystąpił błąd podczas pobierania dokumentu' });
          setDocumentContent(null);
        } finally {
          setIsLoading(false);
        }
      };

      loadDocument();
    }
  }, [id, orgId, isEditMode]);

  const handleDoubleClick = () => {
    setIsEditing(true);
    const htmlContent = mdParser.render(documentContent || '');
    setEditableContent(htmlContent);
  };

  const handleSave = async () => {
    if (!orgId || !editableContent || !documentTitle) return;

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
      setDocumentContent(markdownContent);
    } else {
      errorToast({ message: response.message });
    }
    setIsEditing(false);
  };

  const handleTitleDoubleClick = () => {
    setIsEditingTitle(true);
    setEditableTitle(documentTitle);
  };

  const handleEditTitle = async () => {
    if (!orgId || editableTitle === null) return;

    const response = await updateDocument({
      orgId,
      documentId: id,
      title: editableTitle,
    });

    if (response.success) {
      setDocumentTitle(editableTitle);
    } else {
      errorToast({ message: response.message });
    }
    setIsEditingTitle(false);
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
        <Text>Nie znaleziono dokumentu</Text>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col flex-1 overflow-auto px-4">
      {isEditingTitle ? (
        <Input
          type="text"
          value={editableTitle || ''}
          onChange={(e) => setEditableTitle(e.target.value)}
          onBlur={handleEditTitle}
          onKeyDown={handleTitleKeyDown}
          className="text-2xl p-2 font-bold mb-4 w-full"
          autoFocus
        />
      ) : (
        <Text
          className="text-2xl font-bold mb-4 cursor-pointer"
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
              onChange={(content) => setEditableContent(content)}
              className="flex-1"
            />
          </div>
          <div className="mt-2">
            <Button
              label="Zapisz"
              onClick={handleSave}
              className="bg-blue-500 text-white py-2 px-4 w-full md:w-auto self-center"
            />
          </div>
        </div>
      ) : (
        <div
          className="flex-1 prose prose-lg dark:prose-invert"
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
