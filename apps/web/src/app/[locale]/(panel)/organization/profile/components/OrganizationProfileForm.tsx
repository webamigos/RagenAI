'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Button } from '@ragenai/common-ui/Button';
import { statusToast } from '@/app/lib/utils/toast';
import { updateOrganization } from '../actions/organization';
import {
  UpdateOrganizationSchema,
  type UpdateOrganizationFormData,
} from '../types';

type Organization = {
  id: string;
  name: string;
};

type Props = {
  organization: Organization;
  canEdit: boolean;
};

const inputClasses =
  'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 dark:bg-card dark:text-white';

const labelClasses = 'block text-sm text-muted-foreground mb-1.5';

export function OrganizationProfileForm({ organization, canEdit }: Props) {
  const t = useTranslations('organization.profile');
  const { successToast, errorToast } = statusToast();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<UpdateOrganizationFormData>({
    resolver: zodResolver(UpdateOrganizationSchema),
    defaultValues: {
      name: organization.name,
    },
  });

  const onSubmit = async (data: UpdateOrganizationFormData) => {
    const result = await updateOrganization(data);

    if (result.success) {
      successToast({ message: t('edit-success') });
      reset(data);
    } else {
      errorToast({ message: result.error || t('edit-error') });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Name input */}
      <div>
        <label htmlFor="org-name" className={labelClasses}>
          {t('name')}
        </label>
        <input
          id="org-name"
          type="text"
          placeholder={t('name-placeholder')}
          {...register('name')}
          disabled={isSubmitting || !canEdit}
          className={inputClasses}
        />
        {errors.name && (
          <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      {/* Actions - only show if user can edit */}
      {canEdit && (
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            onClick={() => reset()}
            disabled={isSubmitting || !isDirty}
            outline
          >
            {t('cancel')}
          </Button>
          <Button isSubmit={true} disabled={isSubmitting || !isDirty}>
            {isSubmitting ? t('saving') : t('save')}
          </Button>
        </div>
      )}
    </form>
  );
}
