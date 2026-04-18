'use client';

import { useState } from 'react';
import { ArrowPathIcon } from '@heroicons/react/20/solid';
import { useTranslations } from 'next-intl';
import { Tooltip } from '@ragenai/common-ui/Tooltip';

const ACTION_BUTTON_CLS =
  'inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

type Props = {
  onRegenerate: () => Promise<void>;
  disabled: boolean;
};

export const RegenerateButton = ({ onRegenerate, disabled }: Props) => {
  const [isLoading, setIsLoading] = useState(false);
  const t = useTranslations('assistant.chat');

  const handleClick = async () => {
    if (disabled || isLoading) {
      return;
    }
    setIsLoading(true);
    try {
      await onRegenerate();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Tooltip id="regenerate-btn" content={t('regenerate')}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isLoading}
        data-testid="regenerate-button"
        className={ACTION_BUTTON_CLS}
      >
        <ArrowPathIcon
          className={`size-4 ${isLoading ? 'animate-spin' : ''}`}
        />
      </button>
    </Tooltip>
  );
};
