'use client';

import { useState } from 'react';
import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import { SupportModal } from './SupportModal';

export const SupportFloatingButton = () => {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations('support-page.modal');

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={t('open-button-label')}
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center size-12 rounded-full bg-zinc-900 dark:bg-white shadow-lg hover:bg-zinc-700 dark:hover:bg-zinc-100 transition-colors"
      >
        <QuestionMarkCircleIcon className="size-6 text-white dark:text-zinc-900" />
      </button>
      <SupportModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};
