import { getTranslations } from 'next-intl/server';
import { RegisterForm } from '@/app/components/Forms/';
import { PropsWihLocale } from '@/app/lib/types/types';

export async function generateMetadata({ params: { locale } }: PropsWihLocale) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('sign-up.title'),
  };
}
export default function SignUpPage() {
  return (
    <div>
      <RegisterForm />
    </div>
  );
}
