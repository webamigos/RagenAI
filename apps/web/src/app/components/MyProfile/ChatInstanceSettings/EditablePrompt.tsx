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
import { ASSISTANT_PROMPT_MAX_LENGTH } from '@/features/assistants/constants/limits';

function CharCounter({ count, limit }: { count: number; limit: number }) {
  const ratio = count / limit;
  let colorClass = 'text-muted-foreground opacity-40';
  if (ratio > 1) {
    colorClass = 'text-destructive opacity-100';
  } else if (ratio >= 0.8) {
    colorClass = 'text-pending opacity-70';
  }
  return (
    <span
      className={`text-[11px] font-mono tracking-tight transition-all duration-300 ${colorClass}`}
    >
      {count} / {limit}
    </span>
  );
}

const promptSchema = (minLengthMsg: string, maxLengthMsg: string) =>
  z.object({
    editablePrompt: z
      .string()
      .refine((val) => val.length === 0 || val.length >= 25, {
        message: minLengthMsg,
      })
      .refine((val) => val.length <= ASSISTANT_PROMPT_MAX_LENGTH, {
        message: maxLengthMsg,
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
    watch,
    formState: { errors, isDirty },
  } = useForm<PromptFormValues>({
    resolver: zodResolver(
      promptSchema(
        t('description-min-length'),
        t('char-limit-exceeded', { limit: ASSISTANT_PROMPT_MAX_LENGTH }),
      ),
    ),
    defaultValues: { editablePrompt: '' },
  });

  const charCount = watch('editablePrompt').length;
  const isOverLimit = charCount > ASSISTANT_PROMPT_MAX_LENGTH;

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
        className="mt-1 block w-full rounded-lg border border-border bg-white shadow-none dark:bg-card sm:text-sm"
        showVoiceInput={false}
        placeholder={t('placeholder')}
      />
      <div className="flex items-center justify-between gap-2">
        <CharCounter count={charCount} limit={ASSISTANT_PROMPT_MAX_LENGTH} />

        <Button
          isSubmit={true}
          disabled={!isDirty || isOverLimit}
          className={
            !isDirty || isOverLimit ? 'opacity-50 cursor-not-allowed' : ''
          }
        >
          {t('update')}
        </Button>
      </div>
    </form>
  );
};
