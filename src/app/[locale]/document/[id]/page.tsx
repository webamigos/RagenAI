'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useOrganization } from '@clerk/nextjs';
import MarkdownIt from 'markdown-it';
import TurndownService from 'turndown';
import { statusToast } from '@/app/lib/utils/toast';
import { SpinnerSVG, WysywigEditor, Text } from '@salesyy/common-ui';
import { fetchDocumentByOrganization } from '@/app/components/MarkdownDocumentsCreator/action';

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
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editableContent, setEditableContent] = useState<string | null>(null);

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
            setDocumentContent(documentText);
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

  if (isLoading) return <SpinnerSVG />;
  if (!documentContent) return <p>Nie znaleziono dokumentu</p>;

  return (
    <div className="h-full flex flex-col flex-1 overflow-hidden px-4">
      <Text className="text-2xl font-bold mb-4">Podgląd dokumentu</Text>

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
        <div className="flex-1 overflow-auto" onDoubleClick={handleDoubleClick}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {documentContent}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
