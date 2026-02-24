'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { z } from 'zod';

import { Button, Textarea } from '@ragenai/common-ui';
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
        data.description
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
        <Textarea
          label={t('description-label')}
          mandatory={true}
          {...register('description')}
          rows={4}
          className="w-full"
          error={errors.description}
          errorMessage={errors.description?.message}
          showVoiceInput={false}
          placeholder={t('placeholder')}
        />
      </div>

      <div className="flex justify-end space-x-3 pt-4">
        <Button
          type="button"
          className="bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          onClick={onCancel}
        >
          {t('cancel')}
        </Button>
        <Button isSubmit={true} disabled={isSubmitting}>
          {isSubmitting ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  );
};
