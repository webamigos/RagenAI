'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useOrganization } from '@clerk/nextjs';
import MarkdownIt from 'markdown-it';
import TurndownService from 'turndown';
import { statusToast } from '@/app/lib/utils/toast';
import { SpinnerSVG, WysywigEditor, Text, Input } from '@salesyy/common-ui';
import {
  fetchDocumentByOrganization,
  updateDocumentTitle,
} from '@/app/components/MarkdownDocumentsCreator/action';

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
  }, [id, orgId]);

  const handleDoubleClick = () => {
    setIsEditing(true);
    const htmlContent = mdParser.render(documentContent || '');
    setEditableContent(htmlContent);
  };

  const handleSave = () => {
    const markdownContent = turndownService.turndown(editableContent || '');
    setDocumentContent(markdownContent);
    setIsEditing(false);
  };

  const handleTitleDoubleClick = () => {
    setIsEditingTitle(true);
    setEditableTitle(documentTitle);
  };

  const handleEdit = async () => {
    if (!orgId) {
      return;
    }

    if (editableTitle !== null) {
      const response = await updateDocumentTitle({
        orgId,
        documentId: id,
        title: editableTitle,
      });

      if (response.success) {
        setDocumentTitle(editableTitle);
      } else {
        errorToast({ message: response.message });
      }
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleEdit();
    }
  };

  if (isLoading) {
    return <SpinnerSVG />;
  }
  if (!documentContent) {
    return <Text>Nie znaleziono dokumentu</Text>;
  }

  return (
    <div className="h-full flex flex-col flex-1 overflow-auto px-4">
      {isEditingTitle ? (
        <Input
          type="text"
          value={editableTitle || ''}
          onChange={(e) => setEditableTitle(e.target.value)}
          onBlur={handleEdit}
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
            <WysywigEditor
              value={editableContent || ''}
              onChange={(content) => setEditableContent(content)}
              className="flex-1"
            />
          </div>
          <div className="mt-2">
            <button
              onClick={handleSave}
              className="bg-blue-500 text-white py-2 px-4 rounded w-full md:w-auto self-center"
            >
              Zapisz
            </button>
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
