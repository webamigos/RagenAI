import { unstable_setRequestLocale as setRequestLocale } from 'next-intl/server';
import Client from './Client';

type Props = {
  params: {
    locale: string;
  };
};

export const dynamic = 'force-dynamic';

export default function RedisTestPage({ params: { locale } }: Props) {
  setRequestLocale(locale);

  return (
    <div>
      <Client />
    </div>
  );
}
