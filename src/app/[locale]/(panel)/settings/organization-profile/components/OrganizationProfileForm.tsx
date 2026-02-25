'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { statusToast } from '@/app/lib/utils/toast';
import { updateOrganization } from '../actions/organization';
import {
  UpdateOrganizationSchema,
  type UpdateOrganizationFormData,
} from '../types';

type Organization = {
  id: string;
  name: string;
  slug?: string;
};

type Props = {
  organization: Organization;
  canEdit: boolean;
};

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
      slug: organization.slug || '',
    },
  });

  const onSubmit = async (data: UpdateOrganizationFormData) => {
    const result = await updateOrganization(organization.id, data);

    if (result.success) {
      successToast({ message: t('edit-success') });
      reset(data); // Reset form with new values to clear isDirty
    } else {
      errorToast({ message: result.error || t('edit-error') });
    }
  };

  const handleCancel = () => {
    reset();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Name input */}
      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300"
        >
          {t('name')}
        </label>
        <Input
          id="name"
          type="text"
          placeholder={t('name-placeholder')}
          {...register('name')}
          disabled={isSubmitting || !canEdit}
          error={errors.name}
          errorMessage={errors.name?.message}
        />
      </div>

      {/* Slug input */}
      <div>
        <label
          htmlFor="slug"
          className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300"
        >
          {t('slug')}
        </label>
        <Input
          id="slug"
          type="text"
          placeholder={t('slug-placeholder')}
          {...register('slug')}
          disabled={isSubmitting || !canEdit}
          error={errors.slug}
          errorMessage={errors.slug?.message}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {t('slug-hint')}
        </p>
      </div>

      {/* Actions - only show if user can edit */}
      {canEdit && (
        <div className="flex justify-end space-x-2 pt-4">
          <Button
            type="button"
            onClick={handleCancel}
            disabled={isSubmitting || !isDirty}
            className="bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
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
