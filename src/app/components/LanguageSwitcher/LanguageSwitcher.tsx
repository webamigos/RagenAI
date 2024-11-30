'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';

import { usePathname, useRouter } from '@/i18n/routing';
import { classMerge } from '@ragenai/common-ui';

import 'flag-icons/css/flag-icons.min.css';

type Props = {
  className?: string;
};

export const LanguageSwitcher = ({ className }: Props) => {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const locale = useLocale();

  const languages = {
    en: { flag: 'gb', label: 'English' },
    pl: { flag: 'pl', label: 'Polski' },
  };

  const otherLocale = locale === 'pl' ? 'en' : 'pl';
  const { flag } = languages[otherLocale];

  const handleClick = () => {
    startTransition(() => {
      const newPath = pathname.split('/');
      newPath[1] = otherLocale;
      router.push(newPath.join('/'));
    });
  };

  return (
    <div className={classMerge('flex', className)}>
      <button
        onClick={handleClick}
        className="rounded-full border p-2 opacity-80 hover:bg-gray-100 hover:opacity-100 dark:border-accent-dark-700 dark:hover:bg-accent-dark-700"
      >
        <span className={`fi fi-${flag} m-0.5`} />
      </button>
    </div>
  );
};
