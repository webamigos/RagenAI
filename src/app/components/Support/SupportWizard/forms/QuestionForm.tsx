'use client';

import { useFormContext } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Input } from '@ragenai/common-ui/Input';
import { Textarea } from '@ragenai/common-ui/Textarea';
import type { QuestionFormData } from '../types';

export const QuestionForm = () => {
  const t = useTranslations('support-page');
  const tw = useTranslations('support-page.wizard.question');
  const {
    register,
    formState: { errors },
  } = useFormContext<QuestionFormData>();

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
        label={tw('message-label')}
        mandatory
        rows={4}
        {...register('message')}
        error={errors.message}
        errorMessage={errors.message ? t('errors.message-min') : undefined}
        showVoiceInput={false}
      />
    </div>
  );
};
