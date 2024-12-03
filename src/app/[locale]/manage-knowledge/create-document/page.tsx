'use client';

import { DocumentCreator } from '@/app/components/ManageKnowledge/MarkdownDocumentsCreator/DocumentCreator';

export default function CreateDocumentPage() {
  return (
    <div className="h-full flex-1 flex flex-col gap-4">
      <DocumentCreator />
    </div>
  );
}
