import { ComponentProps } from 'react';
import { default as NextLink } from 'next/link';

import { classMerge } from '@salesyy/common-ui';

type Props = Readonly<{
  href: string;
  children: React.ReactNode;
  variant?: 'button' | 'arrow' | 'blank';
}> &
  ComponentProps<'a'>;

export const Link = ({
  href,
  children,
  className,
  variant = 'blank',
}: Props) => {
  return (
    <NextLink
      href={href}
      className={classMerge(
        'text-sm font-semibold text-salesyy-blue',
        variant === 'button'
          ? 'rounded-md bg-salesyy-blue px-3.5 py-2.5 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'
          : '',
        variant === 'arrow' ? 'leading-6' : '',
        className
      )}
    >
      {children}
      {variant === 'arrow' && (
        <>
          {' '}
          <span aria-hidden="true">→</span>
        </>
      )}
    </NextLink>
  );
};
