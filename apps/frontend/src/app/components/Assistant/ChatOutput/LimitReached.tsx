import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Alert } from '@salesyy/common-ui';

export const LimitReached = () => {
  const t = useTranslations('Index');

  return (
    <div className="mt-auto px-4 sm:px-4 lg:px-22 pb-8">
      <Alert
        title={
          <p>
            {t('limit-reached')}{' '}
            <Link href="/sign-up" className="bold underline">
              Zarejestruj się
            </Link>{' '}
            lub{' '}
            <Link href="/sign-in" className="bold underline">
              zaloguj
            </Link>
            , aby korzystać dalej.
          </p>
        }
        type="info"
      />
    </div>
  );
};
