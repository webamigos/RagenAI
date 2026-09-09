'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@ragenai/common-ui/Button';
import { PlusIcon } from '@heroicons/react/24/outline';
import { logger } from '@/app/lib/utils/logger';
import { createChatbot } from '../actions';

type CreateChatbotButtonProps = {
  onCreated: () => void;
};

export function CreateChatbotButton({ onCreated }: CreateChatbotButtonProps) {
  const t = useTranslations('settings-page.chatbots');
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [showInput, setShowInput] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      return;
    }
    setLoading(true);
    try {
      await createChatbot({ name: name.trim() });
      setName('');
      setShowInput(false);
      onCreated();
    } catch (err) {
      logger.error({ err }, 'Failed to create chatbot');
    } finally {
      setLoading(false);
    }
  };

  if (!showInput) {
    return (
      <Button onClick={() => setShowInput(true)}>
        <PlusIcon className="size-4" />
        {t('create')}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleCreate();
          }
          if (e.key === 'Escape') {
            setShowInput(false);
          }
        }}
        placeholder={t('name-placeholder')}
        aria-label={t('name-placeholder')}
        className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <Button onClick={handleCreate} disabled={loading || !name.trim()}>
        {loading ? t('creating') : t('create')}
      </Button>
      <Button outline onClick={() => setShowInput(false)}>
        {t('cancel')}
      </Button>
    </div>
  );
}
