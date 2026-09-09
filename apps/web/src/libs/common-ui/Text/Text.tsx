import { type ReactNode, type ComponentProps } from 'react';
import { classMerge } from '../utils/cn';

type FontWeight = 'light' | 'normal' | 'medium' | 'semibold' | 'bold';
type FontSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

type Props = {
  children: ReactNode | number;
  fontWeight?: FontWeight;
  fontSize?: FontSize;
  color?: string;
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

export const Text = ({
  children,
  className,
  fontWeight = 'normal',
  fontSize = 'md',
  color = 'text-foreground',
  ...rest
}: ComponentProps<'p'> & Props) => {
  const classNames = classMerge(
    fontWeightMap[fontWeight],
    fontSizeMap[fontSize],
    color,
    className,
  );

  return (
    <p className={classNames} {...rest}>
      {children}
    </p>
  );
};
