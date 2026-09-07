'use client';

import { Suspense, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  file: { fileType: string } | null;
};

type Props = { doc: Doc };

type Tab = 'content' | 'history' | 'optimize';

const TABS: Tab[] = ['content', 'history', 'optimize'];

function TabsInner({ doc }: Props) {
  const t = useTranslations('document-versions');
  const searchParams = useSearchParams();
  const requested = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<Tab>(
    TABS.includes(requested as Tab) ? (requested as Tab) : 'content',
  );
  const md = useMemo(() => new MarkdownIt(), []);
  const renderedContent = useMemo(
    () => DOMPurify.sanitize(md.render(doc.content ?? '')),
    [md, doc.content],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="tablist"
        className="flex border-b border-zinc-200 px-6 dark:border-zinc-800"
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`mr-6 border-b-2 py-3 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {t(`tab-${tab}`)}
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
        {activeTab === 'history' && <VersionHistoryTab documentId={doc.id} />}
        {activeTab === 'optimize' && (
          <OptimizeTab
            documentId={doc.id}
            fileType={doc.file?.fileType ?? 'MARKDOWN'}
          />
        )}
      </div>
    </div>
  );
}

export function DocumentDetailTabs({ doc }: Props) {
  return (
    <Suspense fallback={null}>
      <TabsInner doc={doc} />
    </Suspense>
  );
}
