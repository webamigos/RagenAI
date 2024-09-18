import { useTranslations } from 'next-intl';

import { LikeIcon, DislikeIcon } from '@salesyy/common-ui/icons';
import { useToast } from '@/app/hooks/useToast';

type Props = {
  handleRateMessage: (
    messageId: string,
    feedback: 'up' | 'down',
    runId: string
  ) => Promise<void>;
  publicId: string;
  runId?: string | null;
};

export const RateAnswer = ({ handleRateMessage, publicId, runId }: Props) => {
  const { infoToast } = useToast();
  const t = useTranslations('rate-answer');
  return (
    <>
      <LikeIcon
        onClick={() => {
          handleRateMessage(publicId, 'up', runId!);
          infoToast({
            message: t('thank-you'),
          });
        }}
      />
      <DislikeIcon
        onClick={() => {
          handleRateMessage(publicId, 'down', runId!);
          infoToast({
            message: t('thank-you'),
          });
        }}
      />
    </>
  );
};
