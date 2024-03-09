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

  const handleClick = () => {
    startTransition(() => {
      const newPath = pathname.split('/');
      newPath[1] = localeCode;

      router.push(newPath.join('/'));
    });
  };

  return (
    <div
      onClick={handleClick}
      className={classMerge('cursor-pointer px-4', className)}
    >
      <span className={`fi fi-${flag} mx-auto`} />
    </div>
  );
};
