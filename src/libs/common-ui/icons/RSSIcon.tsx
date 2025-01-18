import type { ComponentProps } from 'react';

import { classMerge } from '../utils/cn';

export const RSSIcon = ({ className }: ComponentProps<'svg'>) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      stroke="currentColor"
      className={classMerge('h-5 w-5', className)}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12.75 19.5v-.75a7.5 7.5 0 0 0-7.5-7.5H4.5m0-6.75h.75c7.87 0 14.25 6.38 14.25 14.25v.75M6 18.75a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
      />
    </svg>
  );
};
