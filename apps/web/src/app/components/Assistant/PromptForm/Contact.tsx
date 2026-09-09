import { useTranslations } from 'next-intl';

import { EnvelopeIcon } from '@heroicons/react/24/outline';

export const Contact = () => {
  const t = useTranslations('form');

  return (
    <span
      className="flex items-center cursor-pointer"
      onClick={() =>
        (window.location.href = 'mailto:hello@salesyy.com?body=Współpraca')
      }
    >
      <EnvelopeIcon
        className="h-5 w-5 flex-none mr-2 dark:text-foreground cursor-pointer"
        aria-hidden="true"
      />

      {t('contact-with-us')}
    </span>
  );
};
