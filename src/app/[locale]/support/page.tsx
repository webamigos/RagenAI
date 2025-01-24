import { SupportForm } from '@/app/components/Support/SupportForm';
import { SupportPageGrid } from '@/app/components/Support/SupportPageGrid';
import { PropsWihLocale } from '@/app/lib/types/types';
import { getTranslations } from 'next-intl/server';

import { CTA } from '@/app/components/Support/CTA';
// export async function generateMetadata({ params: { locale } }: PropsWihLocale) {
//     const t = await getTranslations({ locale, namespace: 'Metadata' });

//     return {
//         title: t('create-organization.title'),
//     };
// }

export default function SupportPage() {
  return (
    <SupportPageGrid>
      <CTA />
      <SupportForm />
    </SupportPageGrid>
  );
}
