'use client';

import { useEffect, useState } from 'react';
// @ts-ignore -- UMD bundle has no type declarations
import MarkdownIt from 'markdown-it/dist/markdown-it.js';
import DOMPurify from 'dompurify';
import { fetchDocumentByOrganization } from '@/app/components/ManageKnowledge/MarkdownDocumentsCreator/action';
import { useOrganization } from '@/app/hooks/use-auth';

import '@/app/components/Assistant/ChatOutput/chat-response.css';

const md = new MarkdownIt();

type Props = {
  documentPublicId: string;
};

export function MarkdownPreview({ documentPublicId }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const { organization } = useOrganization();

  useEffect(() => {
    if (!organization?.id) {
      return;
    }

    fetchDocumentByOrganization(organization.id, documentPublicId).then(
      (result) => {
        if (result.success) {
          const content = result.documents.map((doc) => doc.content).join('\n');
          setHtml(DOMPurify.sanitize(md.render(content)));
        }
      },
    );
  }, [organization?.id, documentPublicId]);

  if (!html) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-hidden">
      <div
        className="chat-response w-[250%] h-[250%] origin-top-left scale-[0.4] p-6"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
