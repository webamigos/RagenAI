import { type ComponentProps } from 'react';

import { classMerge } from '../utils/cn';
import { Divider } from '../Divider';

type Props = {
  children: React.ReactNode;
  showDivider?: boolean;
} & ComponentProps<'h1'>;

/**
 * Page heading with an optional rule under it.
 *
 * The `<h1>` is written out rather than delegated to a Heading component. The
 * one it used to import applied nothing but a class string, so a component
 * boundary bought an import and a level prop this never used — and it was the
 * only reason this file reached into the third-party kit at all.
 *
 * Its classes are carried over unchanged apart from the colours, which now
 * read the tokens instead of naming greys: `text-zinc-950 dark:text-white`
 * for the heading, and the `text-gray-700 dark:text-gray-200` this file added
 * on top of them, which had been quietly overriding the very component it
 * wrapped.
 */
export const Header = ({ children, showDivider = true, className }: Props) => {
  return (
    <>
      <h1
        className={classMerge(
          'mb-2 text-2xl/8 font-semibold text-foreground sm:text-xl/8',
          className,
        )}
      >
        {children}
      </h1>
      {showDivider && <Divider className="mb-2" />}
    </>
  );
};
