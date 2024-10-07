import { unstable_setRequestLocale as setRequestLocale } from 'next-intl/server';

import { ForgotPasswordForm } from '@/app/components/Forms/ForgotPasswordForm';
import { PropsWihLocale } from '@/app/lib/types/types';

export default function ForgotPasswordPage({
  params: { locale },
}: PropsWihLocale) {
  setRequestLocale(locale);
  return <ForgotPasswordForm />;
}
