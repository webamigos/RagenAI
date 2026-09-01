'use client';

import { useFormContext } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Input } from '@ragenai/common-ui/Input';
import { Textarea } from '@ragenai/common-ui/Textarea';
import type { BugFormData } from '../types';

export const BugForm = () => {
  const t = useTranslations('support-page');
  const tw = useTranslations('support-page.wizard.bug');
  const {
    register,
    formState: { errors },
  } = useFormContext<BugFormData>();

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
        rows={3}
        {...register('description')}
        error={errors.description}
        errorMessage={
          errors.description ? t('errors.description-min') : undefined
        }
        showVoiceInput={false}
      />
      <Textarea
        label={tw('steps-label')}
        mandatory
        rows={3}
        placeholder={tw('steps-placeholder')}
        {...register('steps')}
        error={errors.steps}
        errorMessage={errors.steps ? t('errors.steps-min') : undefined}
        showVoiceInput={false}
      />
      <Input
        label={tw('screenshot-label')}
        mandatory={false}
        type="file"
        accept="image/*"
        multiple
        {...register('screenshot')}
        error={errors.screenshot}
        errorMessage={
          errors.screenshot?.message ? t('errors.file-size') : undefined
        }
      />
    </div>
  );
};
