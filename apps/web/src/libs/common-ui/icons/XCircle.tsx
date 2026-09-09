import { type ComponentProps } from 'react';

import { classMerge } from '../utils/cn';

export const XCircle = ({ className, onClick }: ComponentProps<'svg'>) => {
  return (
    <svg
      onClick={onClick}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1"
      stroke="currentColor"
      className={classMerge(
        'w-5 h-5, cursor-pointer text-muted-foreground',
        className,
      )}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
      />
    </svg>
  );
};
