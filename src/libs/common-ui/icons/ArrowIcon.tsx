import { ComponentProps } from 'react';

import { classMerge } from '../utils/cn';

export const ArrowIcon = ({ className, onClick }: ComponentProps<'svg'>) => {
  return (
    <svg
      onClick={onClick}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      stroke="currentColor"
      className={classMerge('w-3 h-3', className)}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 19.5 8.25 12l7.5-7.5"
      />
    </svg>
  );
};
