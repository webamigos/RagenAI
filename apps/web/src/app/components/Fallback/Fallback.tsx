import { getTranslations } from 'next-intl/server';

import { Text } from '@ragenai/common-ui/Text';

type Props = {
  label?: string;
};

export const Fallback = async ({ label = 'loading' }: Props) => {
  const t = await getTranslations('common');
  return <Text>{t(label)}</Text>;
};
