'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { VersionHistoryTab } from './VersionHistoryTab';
import { OptimizeTab } from './OptimizeTab';

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

  const tabs: { id: Tab; label: string }[] = [
    { id: 'content', label: 'Treść' },
    { id: 'history', label: 'Historia wersji' },
    { id: 'optimize', label: 'Optymalizuj pod RAG' },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex border-b border-gray-200 px-6 dark:border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`mr-6 border-b-2 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-[#cb1d3d] text-[#cb1d3d]'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-6">
        {activeTab === 'content' && (
          <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 dark:text-gray-200">
            {doc.content}
          </pre>
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
