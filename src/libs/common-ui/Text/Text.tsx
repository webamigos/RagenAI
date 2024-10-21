import { type ReactNode, type ComponentProps } from 'react';
import { classMerge } from '../utils/cn';

type FontWeight = 'light' | 'normal' | 'medium' | 'semibold' | 'bold';
type FontSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
type Color =
  | 'zinc-950'
  | 'blue-600'
  | 'gray-400'
  | 'gray-500'
  | 'gray-600'
  | 'red-500';

type Props = {
  children: ReactNode | number;
  fontWeight?: FontWeight;
  fontSize?: FontSize;
  color?: Color;
};

const fontWeightMap: Record<FontWeight, string> = {
  light: 'font-light',
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

const fontSizeMap: Record<FontSize, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-md',
  lg: 'text-lg',
  xl: 'text-xl',
};

const colorMap: Record<Color, string> = {
  'zinc-950': 'text-zinc-950',
  'blue-600': 'text-blue-600',
  'gray-600': 'text-gray-600',
  'gray-500': 'text-gray-500',
  'gray-400': 'text-gray-400',
  'red-500': 'text-red-500',
};

export const Text = ({
  children,
  className,
  fontWeight = 'normal',
  fontSize = 'md',
  color = 'zinc-950',
  ...rest
}: ComponentProps<'p'> & Props) => {
  const classNames = classMerge(
    fontWeightMap[fontWeight],
    fontSizeMap[fontSize],
    colorMap[color],
    className
  );

  return (
    <p className={classNames} {...rest}>
      {children}
    </p>
  );
};
