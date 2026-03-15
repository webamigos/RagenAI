'use client';

import { useState, useEffect } from 'react';
import { ChatbotCollapsed } from './ChatbotCollapsed';
import { ChatbotExpanded } from './ChatbotExpanded';

type Props = {
  organizationId: string;
  searchParams: { title: string; message: string };
};

export const ChatbotWidget = ({ organizationId, searchParams }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Todo: This is a hack to make the background transparent, we should find a better way
  useEffect(() => {
    document.body.style.background = 'transparent';

    return () => {
      document.body.style.background = 'var(--background)';
    };
  }, []);

  // TODO: Security — replace '*' with the actual parent origin to prevent data leakage
  // Send initial loaded message
  useEffect(() => {
    window.parent.postMessage(
      {
        type: 'loaded',
      },
      '*',
    );
  }, []);

  // TODO: Security — replace '*' with the actual parent origin to prevent data leakage
  const sendResizeMessage = (newIsOpen: boolean, newIsMinimized: boolean) => {
    window.parent.postMessage(
      {
        type: 'resize',
        width: newIsOpen ? (newIsMinimized ? 400 : 400) : 80,
        height: newIsOpen ? (newIsMinimized ? 64 : 600) : 80,
      },
      '*',
    );
  };

  const handleSetIsOpen = (value: boolean) => {
    setIsOpen(value);
    setIsMinimized(false);
    sendResizeMessage(value, isMinimized);
  };

  const handleSetIsMinimized = (value: boolean) => {
    setIsMinimized(value);
    sendResizeMessage(isOpen, value);
  };

  if (!isOpen) {
    return <ChatbotCollapsed setIsOpen={handleSetIsOpen} />;
  }

  return (
    <ChatbotExpanded
      isMinimized={isMinimized}
      setIsMinimized={handleSetIsMinimized}
      setIsOpen={handleSetIsOpen}
      organizationId={organizationId}
      searchParams={searchParams}
    />
  );
};
