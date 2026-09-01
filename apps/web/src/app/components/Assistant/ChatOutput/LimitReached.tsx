import { useTranslations } from 'next-intl';

import { Alert } from '@ragenai/common-ui/Alert';
import { Link } from '@/i18n/routing';

export const LimitReached = () => {
  const t = useTranslations('Index');

  return (
    <div className="mt-auto px-4 sm:px-4 lg:px-22 pb-8">
      <Alert
        title={
          <p>
            {t('limit-reached')}{' '}
            <Link href="/sign-up" className="bold underline">
              {t('register')}
            </Link>{' '}
            {t('or')}{' '}
            <Link href="/sign-in" className="bold underline">
              {t('log-in')}
            </Link>
            , {t('to-still-use')}.
          </p>
        }
        type="info"
      />
    </div>
  );
};
