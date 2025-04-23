import { useTranslations } from 'next-intl';

import { Text } from '@ragenai/common-ui/Text';

export const CTA = () => {
  const t = useTranslations('support-page');

  return (
    <div className="w-full my-4">
      <Text
        color="gray-700"
        fontWeight="light"
        className="dark:text-gray-400 mb-6"
      >
        {t('call-to-action')}
      </Text>
    </div>
  );
};
