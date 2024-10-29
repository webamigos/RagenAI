import { RegisterForm } from '@/app/components/Forms/';
import { getTranslations } from 'next-intl/server';

type Props = {
  params: {
    locale: string;
  };
};

export async function generateMetadata({ params: { locale } }: Props) {
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
