import { LoginForm } from '@/app/components/Forms/LoginForm';
import { getTranslations } from 'next-intl/server';

type Props = {
  params: {
    locale: string;
  };
};

export async function generateMetadata({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('sign-in.title'),
  };
}

export default function SignInPage() {
  return <LoginForm />;
}
