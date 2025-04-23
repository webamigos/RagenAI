import { type FieldError } from 'react-hook-form';
import { ComponentPropsWithRef, useId } from 'react';
import { useTranslations } from 'next-intl';

import { Field, Label } from '@ragenai/tui';
import { Select as TuiSelect } from '@ragenai/tui';
import { classMerge } from '../utils/cn';
import { Text } from '../Text';

type Props = {
  label: string;
  children: React.ReactNode;
  name?: string;
  hint?: string;
  mandatory?: boolean;
  error?: FieldError;
  errorMessage?: string;
} & ComponentPropsWithRef<'select'>;

export const Select = ({
  name,
  label,
  hint,
  className,
  error,
  errorMessage,
  children,
  mandatory = false,
  ...rest
}: Props) => {
  const t = useTranslations();
  const id = useId();

  return (
    <Field>
      <Label htmlFor={id}>
        {label}
        {mandatory && <span className="text-red-600">*</span>}
      </Label>
      <TuiSelect
        id={id}
        name={name}
        className={classMerge(className)}
        {...rest}
      >
        {children}
      </TuiSelect>
      {error && (
        <Text
          className="mt-2 text-sm text-red-600 dark:text-red-500"
          id="input-error"
        >
          {t(errorMessage ? errorMessage : error.message)}
        </Text>
      )}
      {hint && (
        <Text
          className="text-sm text-gray-500 dark:text-gray-400"
          id="input-description"
        >
          {hint}
        </Text>
      )}
    </Field>
  );
};
