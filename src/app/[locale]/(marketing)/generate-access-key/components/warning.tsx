import { useTranslations } from 'next-intl';

import { Text } from '@ragenai/common-ui/Text';

type WarningProps = {
  warningText: string;
};

export const Warning = ({ warningText }: WarningProps) => {
  const t = useTranslations('generateAccessKey');
  return (
    <div className="space-y-2 p-4 bg-gray-50 rounded-md overflow-x-auto whitespace-pre-wrap  text-gray-600">
      <Text>{t(`${warningText}`)}</Text>
    </div>
  );
};
