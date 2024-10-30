'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useOrganization } from '@clerk/nextjs';

import { statusToast } from '@/app/lib/utils/toast';
import { SpinnerSVG } from '@salesyy/common-ui';
import { fetchDocumentByOrganization } from '@/app/components/MarkdownDocumentsCreator/action';

type DocumentPageProps = {
  params: {
    locale: string;
    id: string;
  };
};

export default function DocumentPage({ params }: DocumentPageProps) {
  const { id } = params;
  const { organization } = useOrganization();

  const [documentContent, setDocumentContent] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { errorToast } = statusToast();
  const orgId = organization?.id.toLowerCase();

  useEffect(() => {
    if (id && orgId) {
      const loadDocument = async () => {
        setIsLoading(true);

        try {
          const content = await fetchDocumentByOrganization(orgId, id);

          if (content.success) {
            setDocumentContent(content.documents.map((doc) => doc.content));
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

  if (isLoading) return <SpinnerSVG />;
  if (!documentContent) return <p>Nie znaleziono dokumentu</p>;

  return (
    <div className="prose max-w-none mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Podgląd dokumentu</h1>
      {documentContent.map((content, index) => (
        <ReactMarkdown key={index} remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      ))}
    </div>
  );
}
