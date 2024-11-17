import { CloudArrowUpIcon } from '@heroicons/react/24/outline';
import { ComponentProps } from 'react';

import { classMerge } from '../utils/cn';

export const ClourArrowIcon = ({ className }: ComponentProps<'svg'>) => {
  return <CloudArrowUpIcon className={classMerge('h-5 w-5', className)} />;
};
