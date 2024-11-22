'use client';

import { Suspense } from 'react';

import {
  ChatModelSelect,
  EditablePrompt,
  SetChatTemperature,
  SetMaxDocumentsToRetrieve,
} from '@/app/components/MyProfile/ChatInstanceSettings';
import { SetApiKeyWrapper } from '@/app/components/MyProfile/ChatInstanceSettings/SetApiKeyWrapper';
import { Fallback } from '@/app/components/Fallback';
import { useSettings } from '@/app/hooks/useSettings';

export default function PromptManagementPage() {
  const { hasApiKey } = useSettings();

  return (
    <div className="container flex flex-col">
      <Suspense fallback={<Fallback />}>
        {hasApiKey ? (
          <>
            <SetApiKeyWrapper />
            <div className="flex md:justify-between mb-5 flex-col lg:flex-row gap-5">
              <ChatModelSelect />
              <SetChatTemperature />
              <SetMaxDocumentsToRetrieve />
            </div>
            <EditablePrompt />
          </>
        ) : (
          <SetApiKeyWrapper />
        )}
      </Suspense>
    </div>
  );
}
