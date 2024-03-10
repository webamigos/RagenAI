import {
  getTranslations,
  unstable_setRequestLocale as setRequestLocale,
} from 'next-intl/server';
import { useTranslations } from 'next-intl';

import { PromptForm } from '../../components/PromptForm';
import { sendPrompt } from './actions';

type Props = {
  params: {
    locale: string;
  };
};

export async function generateMetadata({ params: { locale } }: Props) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('index'),
  };
}

export default function Index({ params: { locale } }: Props) {
  setRequestLocale(locale);
  const t = useTranslations('Index');

  /*
   * Replace the elements below with your own.
   *
   * Note: The corresponding styles are in the ./index.none file.
   */
  return (
    <div className="container mx-auto">
      <PromptForm />
    </div>
  );
}
