import { unstable_setRequestLocale as setRequestLocale } from 'next-intl/server';

import { ResetPasswordForm } from '@/app/components/Forms';
import { PropsWihLocale } from '@/app/lib/types/types';

export default function ResetPasswordPage({
  params: { locale },
}: PropsWihLocale) {
  setRequestLocale(locale);
  return <ResetPasswordForm />;
}
