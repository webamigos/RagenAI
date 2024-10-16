import { memo, type ReactNode, type ComponentProps } from 'react';
import clsx from 'clsx';

type Props = {
  children: string | string[] | ReactNode | number;
  bold?: boolean;
  fontWeight?: 'light' | 'normal' | 'medium' | 'semibold' | 'bold';
  fontSize?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  color?: 'zinc-950' | 'blue-600' | 'gray-400' | 'red-500';
};

const fontWeightMap = {
  light: 'font-light',
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

const fontSizeMap = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-md',
  lg: 'text-lg',
  xl: 'text-xl',
};

const colorMap = {
  'zinc-950': 'text-zinc-950',
  'blue-600': 'text-blue-600',
  'gray-400': 'text-gray-400',
  'red-500': 'text-red-500',
};

export const Text = memo(
  ({
    children,
    className,
    fontWeight = 'normal',
    fontSize = 'md',
    color = 'zinc-950',
    ...rest
  }: ComponentProps<'p'> & Props) => {
    const classNames = clsx(
      className,
      fontWeightMap[fontWeight],
      fontSizeMap[fontSize],
      colorMap[color]
    );

    return (
      <p className={classNames} {...rest}>
        {children}
      </p>
    );
  }
);

Text.displayName = 'Text';
