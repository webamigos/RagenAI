import { memo, type ComponentProps } from 'react';
import clsx from 'clsx';

type Props = {
  children: string | string[];
  bold?: boolean;
  fontWeight?: 'light' | 'normal' | 'medium' | 'semibold' | 'bold';
  fontSize?: 'sm' | 'md' | 'lg' | 'xl';
  color?: 'zinc-950' | 'blue-600';
};

export const Text = memo(
  ({
    children,
    className,
    bold,
    fontWeight = 'normal',
    fontSize = 'md',
    color = 'zinc-950',
    ...rest
  }: ComponentProps<'p'> & Props) => {
    const classNames = clsx(
      className,
      `font-${fontWeight}`,
      `text-${fontSize}`,
      `text-${color}`
    );

    return (
      <p className={classNames} {...rest}>
        {children}
      </p>
    );
  }
);

Text.displayName = 'Text';
