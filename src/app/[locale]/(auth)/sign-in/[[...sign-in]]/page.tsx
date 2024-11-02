import { LoginForm } from '@/app/components/Forms/LoginForm';
import { PropsWihLocale } from '@/app/lib/types/types';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params: { locale } }: PropsWihLocale) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('sign-in.title'),
  };
}

export default function SignInPage() {
  return <LoginForm />;
}
