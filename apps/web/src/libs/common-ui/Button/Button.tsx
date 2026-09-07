import {
  forwardRef,
  memo,
  type ComponentProps,
  type ForwardedRef,
} from 'react';

import { Button as ShadcnButton } from '@/components/ui/button';
import { classMerge } from '../utils/cn';
import { SpinnerSVG, ArrowPath } from '../icons';

/**
 * The app's button. Now over shadcn rather than the third-party kit.
 *
 * ## What changes for the 104 files that use it
 *
 * The default is `bg-primary`, which is the brand navy. It used to be
 * `color="indigo"`, hardcoded here — which is why the interface still had an
 * indigo default action after the palette landed: the tokens were right and
 * this file was overruling them for almost every button in the product.
 *
 * `isError` is `variant="destructive"` — the brand crimson — instead of the
 * hand-rolled `bg-red-500 hover:bg-red-600`. Same reasoning: the palette has
 * a colour for "this destroys something" and it should be the one on screen.
 *
 * ## Two props that were lying
 *
 * `iconLeft` was accepted and then dropped on the floor (`iconLeft:
 * _iconLeft`). Nothing passed it, so nothing broke, but a prop that silently
 * does nothing is worse than no prop. Gone.
 *
 * `href` made this render an anchor, which shadcn's button does not do.
 * Exactly one caller used it; that call site now composes `asChild` with a
 * `Link`, which is the shape the rest of the app already uses for a link that
 * looks like a button. Gone from here too.
 *
 * ## What deliberately stays
 *
 * `isLink` keeps its own class list. It is not shadcn's `link` variant — it
 * is a sidebar row that happens to be a button, and translating it to a
 * variant would change how it looks.
 *
 * `forwardRef` and `memo` stay as they are. React 19 makes the first
 * unnecessary, but 104 call sites depend on the ref contract and this change
 * is about the colours, not the plumbing.
 */
type Props = Readonly<{
  label?: string;
  isLoading?: boolean;
  iconRight?: React.ReactNode;
  isSubmit?: boolean;
  isLink?: boolean;
  isError?: boolean;
  outline?: boolean;
  plain?: boolean;
  children?: React.ReactNode;
}> &
  Omit<ComponentProps<'button'>, 'outline'>;

const ButtonComponent = forwardRef(
  (
    {
      label,
      iconRight,
      className,
      isLoading = false,
      isError = false,
      isLink = false,
      isSubmit = false,
      outline = false,
      plain = false,
      disabled,
      children,
      ...rest
    }: Props,
    ref: ForwardedRef<HTMLButtonElement>,
  ) => {
    const linkClasses =
      'flex items-center gap-3 rounded-md px-2 py-2.5 font-sans text-left text-base font-medium text-muted-foreground md:py-2 text-sm hover:bg-accent';

    const isDisabled = disabled || isLoading || isError;

    let variant: 'default' | 'outline' | 'ghost' | 'destructive' = 'default';
    if (isError) {
      variant = 'destructive';
    } else if (outline) {
      variant = 'outline';
    } else if (plain || isLink) {
      variant = 'ghost';
    }

    return (
      <ShadcnButton
        ref={ref}
        variant={variant}
        disabled={isDisabled}
        {...rest}
        type={isSubmit ? 'submit' : (rest.type ?? 'button')}
        className={
          isLink
            ? classMerge(linkClasses, className)
            : classMerge(isDisabled && 'cursor-not-allowed', className)
        }
      >
        <span className="flex items-center gap-1.5">
          {label && <span>{label}</span>}
          {children}
          {iconRight && !isLoading && <span className="pl-2">{iconRight}</span>}
          {/* `text-current`, not `text-white`: the spinner has to be legible
              on the outline and ghost variants too. */}
          {isLoading && <SpinnerSVG size="sm" className="ml-3 text-current" />}
          {isError && <ArrowPath />}
        </span>
      </ShadcnButton>
    );
  },
);

export const Button = memo(ButtonComponent);

ButtonComponent.displayName = 'Button';
