import { useTranslations } from 'next-intl';

import { Text } from '@ragenai/common-ui/Text';

export const CTA = () => {
  const t = useTranslations('support-page');

  return (
    <div className="w-1/2 mt-16 ml-2">
      <Text color="gray-700">{t('call-to-action')}</Text>
    </div>
  );
};
