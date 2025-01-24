import { useTranslations } from 'next-intl';

import { Text } from '@ragenai/common-ui/Text';

export const CTA = () => {
  const t = useTranslations('support-page');

  return (
    <div className="w-full my-4">
      <Text fontSize="lg" fontWeight="semibold" color="gray-700">
        {t('call-to-action')}
      </Text>
    </div>
  );
};
