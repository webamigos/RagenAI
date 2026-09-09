'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';

type Props = {
  oldValue: string;
  newValue: string;
  oldTitle: string;
  newTitle: string;
};

export function DiffView({ oldValue, newValue, oldTitle, newTitle }: Props) {
  const t = useTranslations('document-versions');
  const [splitView, setSplitView] = useState(true);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () =>
      setIsDark(
        document.documentElement.classList.contains('dark') || mq.matches,
      );
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributeFilter: ['class'] });
    mq.addEventListener('change', update);
    return () => {
      observer.disconnect();
      mq.removeEventListener('change', update);
    };
  }, []);

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {t('diff-view-label')}
        </span>
        <button
          onClick={() => setSplitView(true)}
          className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
            splitView
              ? 'bg-brand-600 text-primary-foreground'
              : 'bg-muted text-foreground hover:bg-paper-200 dark:bg-paper-700 dark:hover:bg-paper-600'
          }`}
        >
          {t('diff-view-split')}
        </button>
        <button
          onClick={() => setSplitView(false)}
          className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
            !splitView
              ? 'bg-brand-600 text-primary-foreground'
              : 'bg-muted text-foreground hover:bg-paper-200 dark:bg-paper-700 dark:hover:bg-paper-600'
          }`}
        >
          {t('diff-view-unified')}
        </button>
      </div>
      <ReactDiffViewer
        oldValue={oldValue}
        newValue={newValue}
        splitView={splitView}
        compareMethod={DiffMethod.WORDS}
        leftTitle={oldTitle}
        rightTitle={newTitle}
        useDarkTheme={isDark}
        styles={
          isDark
            ? {
                titleBlock: {
                  backgroundColor: '#2e303c',
                  borderBottom: '1px solid #3f3f46',
                  color: '#a1a1aa',
                  fontSize: '12px',
                  padding: '8px 12px',
                },
                lineNumber: {
                  backgroundColor: '#2c2f3a',
                  color: '#52525b',
                },
                contentText: {
                  fontSize: '13px',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  lineHeight: '1.6',
                },
                content: {
                  padding: '0 16px',
                },
              }
            : {
                titleBlock: {
                  backgroundColor: '#f4f4f5',
                  borderBottom: '1px solid #e4e4e7',
                  color: '#71717a',
                  fontSize: '12px',
                  padding: '8px 12px',
                },
                contentText: {
                  fontSize: '13px',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  lineHeight: '1.6',
                },
                content: {
                  padding: '0 16px',
                },
              }
        }
      />
    </div>
  );
}
