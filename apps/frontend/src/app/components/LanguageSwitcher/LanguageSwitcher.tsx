'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';

import { classMerge } from '@salesyy/common-ui';
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
    <div className="flex">
      <div
        onClick={handleClick}
        className={classMerge('cursor-pointer opacity-85 px-2', className)}
      >
        <span className={`fi fi-${flag} mx-auto`} />
      </div>
    </div>
  );
};
