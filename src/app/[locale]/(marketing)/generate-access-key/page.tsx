import { unstable_setRequestLocale as setRequestLocale } from 'next-intl/server';

import { GenerateAccessKey } from './components/generate-access-key';

type Props = {
  params: {
    locale: string;
  };
};

export async function generateMetadata({ params: { locale } }: Props) {
  return {
    title: '😶‍🌫️ Generowanie klucza dostępu do organizacji',
  };
}

export default function Index({ params: { locale } }: Props) {
  setRequestLocale(locale);
  return (
    <div>
      <div className="container mx-auto h-full mt-4">
        <GenerateAccessKey />
      </div>
    </div>
  );
}
