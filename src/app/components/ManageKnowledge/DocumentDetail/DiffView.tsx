'use client';

import { useState } from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';

type Props = {
  oldValue: string;
  newValue: string;
  oldTitle: string;
  newTitle: string;
};

export function DiffView({ oldValue, newValue, oldTitle, newTitle }: Props) {
  const [splitView, setSplitView] = useState(true);

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm text-gray-600 dark:text-gray-400">Widok:</span>
        <button
          onClick={() => setSplitView(true)}
          className={`rounded px-3 py-1 text-sm ${
            splitView
              ? 'bg-[#cb1d3d] text-white'
              : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
          }`}
        >
          Obok siebie
        </button>
        <button
          onClick={() => setSplitView(false)}
          className={`rounded px-3 py-1 text-sm ${
            !splitView
              ? 'bg-[#cb1d3d] text-white'
              : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
          }`}
        >
          Unified
        </button>
      </div>
      <ReactDiffViewer
        oldValue={oldValue}
        newValue={newValue}
        splitView={splitView}
        compareMethod={DiffMethod.WORDS}
        leftTitle={oldTitle}
        rightTitle={newTitle}
        useDarkTheme={false}
      />
    </div>
  );
}
