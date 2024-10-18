import { unstable_setRequestLocale as setRequestLocale } from 'next-intl/server';

import { EnterCodeForm } from '@/app/components/Forms/EnterCodeForm';
import { PropsWihLocale } from '@/app/lib/types/types';

export default function EnterCodePage({ params: { locale } }: PropsWihLocale) {
  setRequestLocale(locale);
  return <EnterCodeForm />;
}
