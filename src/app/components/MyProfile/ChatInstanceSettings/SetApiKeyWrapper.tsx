import { useTranslations } from 'next-intl';

import { Card } from '@salesyy/common-ui/Card';
import { SetApiKeys } from './SetApiKeys';

export const SetApiKeyWrapper = () => {
  const t = useTranslations('set-openai-api-key');
  return (
    <Card title={t('set-env')} size="full" className="mb-5">
      <SetApiKeys />
    </Card>
  );
};
