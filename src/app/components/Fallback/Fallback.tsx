import { getTranslations } from 'next-intl/server';

import { Text } from '@salesyy/common-ui';

type Props = {
  label?: string;
};

export const Fallback = async ({ label = 'loading' }: Props) => {
  const t = await getTranslations('common');
  return <Text>{t(label)}</Text>;
};
