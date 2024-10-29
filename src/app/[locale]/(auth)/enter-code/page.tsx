import {
  getTranslations,
  unstable_setRequestLocale as setRequestLocale,
} from 'next-intl/server';

import { EnterCodeForm } from '@/app/components/Forms/EnterCodeForm';
import { PropsWihLocale } from '@/app/lib/types/types';

type Props = {
  params: {
    locale: string;
  };
};

export async function generateMetadata({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('enter-code.title'),
  };
}

export default function EnterCodePage({ params: { locale } }: PropsWihLocale) {
  setRequestLocale(locale);
  return <EnterCodeForm />;
}
