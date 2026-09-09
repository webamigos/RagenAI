'use client';

import { classMerge } from '../utils/cn';

import { Switch as HeadlessSwitch } from '@headlessui/react';

type Props = {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
};

export const Switch = ({
  checked,
  onChange,
  disabled = false,
  label,
  className,
}: Props) => {
  return (
    <div className={classMerge('flex items-center gap-2', className)}>
      {label && (
        <span className="text-sm text-gray-700 dark:text-gray-300 select-none">
          {label}
        </span>
      )}

      <HeadlessSwitch
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className={classMerge(
          'relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus:outline-hidden',
          checked ? 'bg-brand-500' : 'bg-gray-300 dark:bg-gray-600',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span
          aria-hidden="true"
          className={classMerge(
            'pointer-events-none inline-block h-[18px] w-[18px] translate-y-[2px] transform rounded-full bg-white shadow-sm ring-0 transition duration-200',
            checked ? 'translate-x-[18px]' : 'translate-x-[2px]',
          )}
        />
      </HeadlessSwitch>
    </div>
  );
};
