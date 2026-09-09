'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useSession } from '@/app/hooks/use-better-auth';
import { Button } from '@ragenai/common-ui/Button';
import { statusToast } from '@/app/lib/utils/toast';
import { updateProfile } from '../actions/user';
import { UpdateProfileSchema, type UpdateProfileFormData } from '../types';

type User = {
  name?: string | null;
  email: string;
};

type Props = {
  user: User;
  /**
   * The shared demo account: the name is shown but cannot be edited, because
   * every visitor sees the same one. Decided on the server from the published
   * demo address; the server action and the auth hook refuse the write too.
   */
  locked?: boolean;
};

const inputClasses =
  'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50';

const labelClasses = 'block text-sm text-muted-foreground mb-1.5';

export function ProfileEditForm({ user, locked = false }: Props) {
  const t = useTranslations('user-profile.profile');
  const { refetch } = useSession();
  const router = useRouter();
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
    },
  });

  const onSubmit = async (data: UpdateProfileFormData) => {
    const result = await updateProfile(data.name);

    if (result.success) {
      successToast({ message: t('success') });
      reset(data);
      await refetch();
      router.refresh();
    } else {
      errorToast({ message: result.error || t('error') });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Email (read-only) */}
      <div>
        <label htmlFor="email" className={labelClasses}>
          {t('email')}
        </label>
        <input
          id="email"
          type="email"
          value={user.email}
          disabled
          className={inputClasses}
        />
        <p className="mt-1 text-xs text-muted-foreground">{t('email-hint')}</p>
      </div>

      {/* Name */}
      <div>
        <label htmlFor="name" className={labelClasses}>
          {t('name')}
        </label>
        <input
          id="name"
          type="text"
          placeholder={t('name-placeholder')}
          {...register('name')}
          disabled={isSubmitting || locked}
          aria-describedby={locked ? 'name-locked-hint' : undefined}
          className={inputClasses}
        />
        {locked && (
          <p
            id="name-locked-hint"
            className="mt-1 text-xs text-muted-foreground"
          >
            {t('demo-account-locked')}
          </p>
        )}
        {errors.name && (
          <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          onClick={() => reset()}
          disabled={isSubmitting || !isDirty}
          outline
        >
          {t('cancel')}
        </Button>
        <Button isSubmit={true} disabled={isSubmitting || !isDirty || locked}>
          {isSubmitting ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  );
}
