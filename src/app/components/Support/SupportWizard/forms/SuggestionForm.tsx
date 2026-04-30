'use client';

import { useFormContext } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Input } from '@ragenai/common-ui/Input';
import { Textarea } from '@ragenai/common-ui/Textarea';
import type { SuggestionFormData } from '../types';

export const SuggestionForm = () => {
  const t = useTranslations('support-page');
  const tw = useTranslations('support-page.wizard.suggestion');
  const {
    register,
    formState: { errors },
  } = useFormContext<SuggestionFormData>();

  return (
    <div className="space-y-4">
      <Input
        label={tw('title-label')}
        mandatory
        type="text"
        {...register('title')}
        error={errors.title}
        errorMessage={errors.title ? t('errors.title-min') : undefined}
      />
      <Textarea
        label={tw('description-label')}
        mandatory
        rows={4}
        {...register('description')}
        error={errors.description}
        errorMessage={
          errors.description ? t('errors.description-min') : undefined
        }
        showVoiceInput={false}
      />
    </div>
  );
};
