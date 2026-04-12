'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { Button } from '@ragenai/common-ui/Button';
import { Textarea } from '@ragenai/common-ui/Textarea';
import { statusToast } from '@/app/lib/utils/toast';
import { fetchSettings, saveSetting } from './actions';
import { SettingsType } from './types';
import { defaultOrganizationSettings } from '@/features/organizations/constants/settings';

const promptSchema = (t: (key: string) => string) =>
  z.object({
    editablePrompt: z
      .string()
      .refine((val) => val.length === 0 || val.length >= 25, {
        error: t('description-min-length'),
      }),
  });

type PromptFormValues = z.infer<ReturnType<typeof promptSchema>>;

export const EditablePrompt = () => {
  const [nonEditablePrompt, setNonEditablePrompt] = useState(
    defaultOrganizationSettings.prompt,
  );

  const { successToast, errorToast } = statusToast();
  const t = useTranslations('assistant-settings.editable-prompt');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<PromptFormValues>({
    resolver: zodResolver(promptSchema(t)),
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
        errorToast({ message: t('no-changes-detected') });
        return;
      }

      const fullPrompt = `${editablePrompt.trim()}\n${nonEditablePrompt.trim()}`;

      const { success } = await saveSetting(SettingsType.prompt, fullPrompt);

      if (success) {
        successToast({ message: t('prompt-updated-successfully') });
        reset({ editablePrompt });
      }
    } catch (err) {
      errorToast({ message: t('failed-to-update-prompt') });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Textarea
        rows={4}
        showArrowIcon={false}
        error={errors.editablePrompt}
        {...register('editablePrompt')}
        errorMessage={errors.editablePrompt?.message}
        label={t('label')}
        className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white shadow-none dark:border-zinc-700 dark:bg-zinc-900 sm:text-sm"
        showVoiceInput={false}
        placeholder={t('placeholder')}
      />
      <div className="flex justify-end">
        <Button isSubmit={true} disabled={!isDirty}>
          {t('update')}
        </Button>
      </div>
    </form>
  );
};
