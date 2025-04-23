import { ComponentProps } from 'react';

import { classMerge } from '../utils/cn';
import { Heading } from '@ragenai/tui';
import { Divider } from '../Divider';

type Props = {
  children: React.ReactNode;
} & ComponentProps<'h1'>;

export const Header = ({ children, className }: Props) => {
  return (
    <>
      <Heading
        className={classMerge(
          'mb-2 text-gray-700 dark:text-gray-200',
          className
        )}
      >
        {children}
      </Heading>
      <Divider className="mb-2" />
    </>
  );
};
