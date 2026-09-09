import { forwardRef, type ComponentProps } from 'react';
import { Link as I18nLink } from '@/i18n/routing';
import { classMerge } from '@ragenai/common-ui/utils/cn';

type Props = Readonly<{
  href: string;
  children: React.ReactNode;
  variant?: 'button' | 'arrow' | 'blank';
  underline?: boolean;
}> &
  ComponentProps<'a'>;

export const Link = forwardRef<HTMLAnchorElement, Props>(
  (
    { href, children, className, variant = 'blank', underline = false },
    ref,
  ) => {
    return (
      <I18nLink href={href} passHref legacyBehavior>
        <a
          ref={ref}
          className={classMerge(
            'text-sm font-semibold text-primary',
            variant === 'button'
              ? 'rounded-md bg-brand-900 px-3.5 py-2.5 text-white shadow-xs hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600'
              : '',
            variant === 'arrow' ? 'leading-6' : '',
            underline ? 'hover:underline' : '',
            className,
          )}
        >
          {children}
          {variant === 'arrow' && (
            <>
              <span aria-hidden="true">→</span>
            </>
          )}
        </a>
      </I18nLink>
    );
  },
);

Link.displayName = 'Link';
