import { type ComponentProps, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Input, SearchIcon, XCircle } from '@ragenai/common-ui';

type FileSearchProps = {
  className: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

export const FileSearch = ({
  className,
  value,
  onChange,
}: ComponentProps<'div'> & FileSearchProps) => {
  const [isFocused, setIsFocused] = useState(false);

  const t = useTranslations('files-table');

  const handleClear = () => {
    onChange({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>);
  };

  const toggleFocus = (prevState: boolean) => !prevState;

  return (
    <div className={className}>
      <Input
        value={value}
        onChange={onChange}
        className={`h-7 pl-3 transition-all duration-300 ease-in-out ${
          isFocused ? 'w-64 md:w-80' : 'w-56'
        }`}
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
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={t('search-placeholder')}
      />
    </div>
  );
};
