import { ComponentProps } from 'react';

import { classMerge } from '../utils/cn';

export const ArrowRight = ({ className }: ComponentProps<'svg'>) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="3"
      stroke="currentColor"
      className={classMerge(
        className,
        'w-3 h-3 transform opacity-0 -translate-x-2 transition-all duration-300 ease-out group-hover:translate-x-0 group-hover:opacity-50'
      )}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
      />
    </svg>
  );
};
