'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Button, Card, Textarea } from '@ragenai/common-ui';
import { statusToast } from '@/app/lib/utils/toast';
import { fetchSettings, saveSetting } from './actions';
import { SettingsType } from './types';
import { defaultOrganizationSettings } from '@/app/lib/constants/settings';

const promptSchema = z.object({
  editablePrompt: z
    .string()
    .min(25, 'Prompt must be at least 25 characters long'),
});

type PromptFormValues = z.infer<typeof promptSchema>;

export const EditablePrompt = () => {
  const [nonEditablePrompt, setNonEditablePrompt] = useState(
    defaultOrganizationSettings.prompt
  );

  const { successToast, errorToast } = statusToast();
  const t = useTranslations('assistant-settings.editable-prompt');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<PromptFormValues>({
    resolver: zodResolver(promptSchema),
  });

  useEffect(() => {
    const fetchPrompt = async () => {
      const result = await fetchSettings();

      if (result.success) {
        const { prompt } = result.data;
        if (prompt) {
          const parts = prompt.split('=');

          const editablePart = parts[0].trim();
          const nonEditablePart = parts.slice(1).join('=').trim();

          reset({ editablePrompt: editablePart });
          setNonEditablePrompt(nonEditablePart);
        }
      }
    };

    fetchPrompt();
  }, [reset]);

  const onSubmit = async (data: PromptFormValues) => {
    try {
      const { editablePrompt } = data;
      if (!isDirty) {
        errorToast({ message: 'no-changes-detected' });
        return;
      }

      const fullPrompt = `${editablePrompt.trim()}\n${nonEditablePrompt.trim()}`;

      const { success } = await saveSetting(SettingsType.prompt, fullPrompt);

      if (success) {
        successToast({ message: 'prompt-updated-successfully' });
        reset({ editablePrompt });
      }
    } catch (err) {
      errorToast({ message: 'failed-to-update-prompt' });
    }
  };

  return (
    <Card size="full" className="py-4 max-h-fit mb-3" title={t('title')}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <Textarea
            rows={4}
            required
            error={errors.editablePrompt}
            {...register('editablePrompt')}
            errorMessage={errors.editablePrompt?.message}
            label={t('label')}
            className="mt-1 block w-full dark:bg-accent-dark-500 border border-primary-blue-500 dark:border-gray-600 shadow-none focus:ring-primary-blue-500 focus:border-primary-blue-500 sm:text-sm"
            showVoiceInput={false}
          />
        </div>
        <Button
          type="submit"
          label={`${t('update')}`}
          className="px-4 py-2 bg-primary-blue-400 dark:bg-accent-dark-500 text-white hover:bg-primary-blue-500 dark:hover:bg-accent-dark-700"
        />
      </form>
    </Card>
  );
};
