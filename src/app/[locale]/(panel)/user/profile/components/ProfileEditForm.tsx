'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { statusToast } from '@/app/lib/utils/toast';
import { updateProfile } from '../actions/user';
import { UpdateProfileSchema, type UpdateProfileFormData } from '../types';

type User = {
  name?: string | null;
  email: string;
  image?: string | null;
};

type Props = {
  user: User;
};

export function ProfileEditForm({ user }: Props) {
  const t = useTranslations('user-profile.profile');
  const { successToast, errorToast } = statusToast();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<UpdateProfileFormData>({
    resolver: zodResolver(UpdateProfileSchema),
    defaultValues: {
      name: user.name || '',
      image: user.image || '',
    },
  });

  const onSubmit = async (data: UpdateProfileFormData) => {
    const result = await updateProfile(data.name, data.image);

    if (result.success) {
      successToast({ message: t('success') });
      reset(data); // Reset form with new values to clear isDirty
    } else {
      errorToast({ message: result.error || t('error') });
    }
  };

  const handleCancel = () => {
    reset();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Email (read-only) */}
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300"
        >
          {t('email')}
        </label>
        <Input id="email" type="email" value={user.email} disabled />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {t('email-hint')}
        </p>
      </div>

      {/* Name */}
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
          disabled={isSubmitting}
          error={errors.name}
          errorMessage={errors.name?.message}
        />
      </div>

      {/* Profile Image URL */}
      <div>
        <label
          htmlFor="image"
          className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300"
        >
          {t('image')}
        </label>
        <Input
          id="image"
          type="text"
          placeholder={t('image-placeholder')}
          {...register('image')}
          disabled={isSubmitting}
          error={errors.image}
          errorMessage={errors.image?.message}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {t('image-hint')}
        </p>
      </div>

      {/* Actions */}
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
    </form>
  );
}
