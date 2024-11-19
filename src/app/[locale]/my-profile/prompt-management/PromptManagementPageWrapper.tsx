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
    <div key={hasApiKey.toString()} className="container flex flex-col">
      {hasApiKey ? (
        <>
          <Suspense fallback={<Fallback />}>
            <SetApiKeyWrapper />
          </Suspense>
          <div className="flex md:justify-between mb-5 flex-col lg:flex-row gap-5">
            <Suspense fallback={<Fallback />}>
              <ChatModelSelect />
              <SetChatTemperature />
              <SetMaxDocumentsToRetrieve />
            </Suspense>
          </div>
          <Suspense fallback={<Fallback />}>
            <EditablePrompt />
          </Suspense>
        </>
      ) : (
        <Suspense fallback={<Fallback />}>
          <SetApiKeyWrapper />
        </Suspense>
      )}
    </div>
  );
}
