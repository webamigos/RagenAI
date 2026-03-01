import { type ComponentProps, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';

import { Input } from '@ragenai/common-ui/Input';
import { SearchIcon, XCircle } from '@ragenai/common-ui/icons';

type FileSearchProps = {
  className?: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

export const FileSearch = ({
  className,
  value,
  onChange,
}: ComponentProps<'div'> & FileSearchProps) => {
  const t = useTranslations('files-table');
  const [isOpenMobile, setIsOpenMobile] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClear = () => {
    onChange({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>);
  };

  const handleOpenSearch = () => {
    setIsOpenMobile(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  };

  const handleBlur = () => {
    setIsOpenMobile(false);
  };

  return (
    <div className={className}>
      {/* --- MOBILE section (below md) --- */}
      <div className="relative flex items-center justify-end md:hidden">
        {!isOpenMobile && (
          <button onClick={handleOpenSearch}>
            <SearchIcon className="w-5 h-5 absolute top-6 right-2" />
          </button>
        )}

        <Input
          ref={inputRef}
          value={value}
          onChange={onChange}
          onBlur={handleBlur}
          className={`
          absolute right-0 top-1
          overflow-hidden
          transition-all duration-300 ease-in-out
          h-7 pl-3
          border
          ${isOpenMobile ? 'w-64' : 'w-0 p-0 border-0'}
        `}
          placeholder={t('search-placeholder')}
          iconRight={
            value ? (
              <button
                onClick={handleClear}
                className="flex items-center justify-center h-full w-6"
              >
                <XCircle className="h-5 w-5" />
              </button>
            ) : !isOpenMobile ? null : (
              <SearchIcon className="absolute top-2.5 right-1 h-4 w-4" />
            )
          }
        />
      </div>

      {/* --- DESKTOP section (md and above) --- */}
      <div className="hidden md:block">
        <Input
          value={value}
          onChange={onChange}
          className={`
          pl-3
          transition-all duration-300 ease-in-out
          w-56 focus:w-64
        `}
          iconRight={
            value ? (
              <button
                onClick={handleClear}
                className="flex items-center justify-center h-full w-6"
              >
                <XCircle className="h-5 w-5" />
              </button>
            ) : (
              <SearchIcon className="h-4 w-4" />
            )
          }
          placeholder={t('search-placeholder')}
        />
      </div>
    </div>
  );
};
