'use client';

import { Suspense, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
// @ts-ignore -- UMD bundle has no type declarations
import MarkdownIt from 'markdown-it/dist/markdown-it.js';
import DOMPurify from 'dompurify';
import { VersionHistoryTab } from './VersionHistoryTab';
import { OptimizeTab } from './OptimizeTab';
import '@/app/components/Assistant/ChatOutput/chat-response.css';
import '@/app/[locale]/(panel)/document/[documentId]/document-preview.css';

type Doc = {
  id: string;
  title: string;
  content: string;
  file: {
    id: string;
    fileType: string;
    metadata: unknown;
    embeddingStatus: string;
  } | null;
};

type Props = { doc: Doc; orgId: string };

type Tab = 'content' | 'history' | 'optimize';

function TabsInner({ doc, orgId }: Props) {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as Tab) ?? 'content';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const md = useMemo(() => new MarkdownIt(), []);
  const renderedContent = useMemo(
    () => DOMPurify.sanitize(md.render(doc.content ?? '')),
    [md, doc.content],
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: 'content', label: 'Treść' },
    { id: 'history', label: 'Historia wersji' },
    { id: 'optimize', label: 'Optymalizuj pod RAG' },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex border-b border-zinc-200 px-6 dark:border-zinc-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`mr-6 border-b-2 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-6">
        {activeTab === 'content' && (
          <div
            className="chat-response document-preview max-w-5xl"
            dangerouslySetInnerHTML={{ __html: renderedContent }}
          />
        )}
        {activeTab === 'history' && (
          <VersionHistoryTab documentId={doc.id} orgId={orgId} />
        )}
        {activeTab === 'optimize' && (
          <OptimizeTab
            documentId={doc.id}
            orgId={orgId}
            fileType={doc.file?.fileType ?? 'MARKDOWN'}
          />
        )}
      </div>
    </div>
  );
}

export function DocumentDetailTabs({ doc, orgId }: Props) {
  return (
    <Suspense fallback={null}>
      <TabsInner doc={doc} orgId={orgId} />
    </Suspense>
  );
}
