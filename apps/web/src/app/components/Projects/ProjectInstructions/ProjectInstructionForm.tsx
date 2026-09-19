'use client';

import { useEffect, useRef } from 'react';
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

  // The initial load does not block submission, so its response can land
  // after a save. It carries the value from *before* that save, and resetting
  // to it would blank the box again — the same lie by a different route.
  // Once the operator has submitted, the box reflects their intent and the
  // in-flight load has nothing left to say.
  const submitSupersedesInitialLoad = useRef(false);

  const onSubmit = async (data: ProjectInstructionFormData) => {
    submitSupersedesInitialLoad.current = true;

    try {
      const result = await saveProjectInstructionAction(
        projectId,
        data.description,
      );

      if (result.success) {
        successToast({ message: t('instruction-saved') });
        // Reset *to what was saved*, not to the empty default. A bare
        // `reset()` returns the form to `defaultValues`, so the operator
        // watched their instruction disappear from the box at the moment they
        // saved it.
        //
        // This is not the fix for `p0-22-projects`' flapping assertion — that
        // was measured and it is not: the value never reaches
        // `project_settings.instructions` at all, while the endpoint reports
        // success. This only stops the field lying about what was just saved.
        reset({ description: data.description });

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
    submitSupersedesInitialLoad.current = false;
    let abandoned = false;

    const fetchInstruction = async () => {
      const result = await getProjectInstructionAction(projectId);
      if (abandoned || submitSupersedesInitialLoad.current) {
        return;
      }
      if (result.success) {
        reset({ description: result.instruction || '' });
      }
    };

    fetchInstruction();

    return () => {
      abandoned = true;
    };
  }, [projectId]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          {t('description-label')}
          <span className="text-destructive">*</span>
        </label>
        <textarea
          {...register('description')}
          rows={6}
          placeholder={t('placeholder')}
          className="block w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
        {errors.description && (
          <p className="mt-1 text-sm text-destructive">
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
