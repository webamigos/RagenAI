'use client';

import { useState } from 'react';
import axios from 'axios';

import { Button } from '@salesyy/common-ui';

import { ChatOutput } from './ChatOutput';
import { PromptForm } from './PromptForm';
import { CreateThreadDto } from '../../api/threads/route';

const LOCAL_STORAGE_THREAD_KEY = 'salesyy_thread_id';

export const Assistant = () => {
  const [threadId, setThreadId] = useState(() => {
    const localThreadId = localStorage.getItem(LOCAL_STORAGE_THREAD_KEY);
    return localThreadId ? localThreadId : '';
  });

  const handleNewThread = async () => {
    try {
      const result = await axios.post<CreateThreadDto>('/api/threads');
      const threadId = result.data.public_id;
      setThreadId(threadId);
      localStorage.setItem(LOCAL_STORAGE_THREAD_KEY, threadId);
      console.log(threadId);
    } catch {
      // TODO: implement
    }
  };

  return (
    <div className="container mx-auto">
      <p>Thread id: {threadId}</p>

      <ChatOutput />
      {threadId && <PromptForm threadId={threadId} />}

      {!threadId && (
        <Button label="Start new thread" onClick={handleNewThread} />
      )}
    </div>
  );
};
