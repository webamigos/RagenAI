'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';

import { classMerge } from '@salesyy/common-ui';

import 'node_modules/flag-icons/css/flag-icons.min.css';

type Props = {
  className?: string;
};

export const LanguageSwitcher = ({ className }: Props) => {
  const router = useRouter();
  const pathname = usePathname();
  const [_isPending, startTransition] = useTransition();
  const locale = useLocale();
  // TODO: refactor
  const flag = locale === 'pl' ? 'gb' : 'pl';
  const localeCode = locale === 'pl' ? 'en' : 'pl';

  const handleClick = (language: string) => {
    if (language !== locale) {
      startTransition(() => {
        const newPath = pathname.split('/');
        newPath[1] = language;

        router.push(newPath.join('/'));
      });
    }
  };

  return (
    <div className="flex">
      <div
        onClick={() => handleClick('en')}
        className={classMerge('cursor-pointer opacity-85 px-3', className)}
      >
        <span className={`fi fi-gb mx-auto`} />
      </div>
      <div
        onClick={() => handleClick('pl')}
        className={classMerge('cursor-pointer opacity-85 px-3', className)}
      >
        <span className={`fi fi-pl mx-auto`} />
      </div>
    </div>
  );
};
