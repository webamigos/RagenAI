'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Button } from '@ragenai/common-ui/Button';
import { Textarea } from '@ragenai/common-ui/Textarea';
import { statusToast } from '@/app/lib/utils/toast';
import { logger } from '@/app/lib/utils/logger';
import {
  getProjectInstructionAction,
  saveProjectInstructionAction,
} from './actions';

const getProjectInstructionSchema = (t: (key: string) => string) =>
  z.object({
    description: z
      .string()
      .refine((val) => val.length === 0 || val.length >= 10, {
        error: t('description-min-length'),
      }),
  });

type ProjectInstructionFormData = z.infer<
  ReturnType<typeof getProjectInstructionSchema>
>;

type ProjectInstructionFormProps = {
  projectId: string;
  onSuccess?: () => void;
  onCancel?: () => void;
};

export const ProjectInstructionForm = ({
  projectId,
  onSuccess,
  onCancel,
}: ProjectInstructionFormProps) => {
  const t = useTranslations('projects.project-instructions');
  const schema = getProjectInstructionSchema(t);
  const { errorToast, successToast } = statusToast();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ProjectInstructionFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      description: '',
    },
  });

  const onSubmit = async (data: ProjectInstructionFormData) => {
    try {
      const result = await saveProjectInstructionAction(
        projectId,
        data.description,
      );

      if (result.success) {
        successToast({ message: t('instruction-saved') });
        reset();

        if (onSuccess) {
          onSuccess();
        }
      } else {
        throw new Error(result.message || 'Failed to save instruction');
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to save project instruction');
      errorToast({
        message: t('save-error'),
      });
    }
  };

  useEffect(() => {
    const fetchInstruction = async () => {
      const result = await getProjectInstructionAction(projectId);
      if (result.success) {
        reset({ description: result.instruction || '' });
      }
    };

    fetchInstruction();
  }, [projectId]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {t('description-label')}
          <span className="text-red-600">*</span>
        </label>
        <textarea
          {...register('description')}
          rows={6}
          placeholder={t('placeholder')}
          className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500 resize-none"
        />
        {errors.description && (
          <p className="mt-1 text-sm text-red-600">
            {errors.description.message}
          </p>
        )}
      </div>

      <div className="flex justify-end space-x-2">
        <Button type="button" plain onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button isSubmit={true} disabled={isSubmitting}>
          {isSubmitting ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  );
};
