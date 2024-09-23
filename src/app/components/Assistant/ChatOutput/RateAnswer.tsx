import { useTranslations } from 'next-intl';
import { LikeIcon, DislikeIcon } from '@salesyy/common-ui/icons';
import { rateMessage } from '@/app/actions';
import { useToast } from '@/app/hooks/useToast';
import { useState, useEffect } from 'react';

type Props = {
  publicId: string;
  initialRated?: number | null;
  runId?: string | null;
};

export const RateAnswer = ({ publicId, runId, initialRated }: Props) => {
  const [rated, setRated] = useState<number | null | undefined>(initialRated);

  const t = useTranslations('rate-answer');
  const { infoToast, errorToast } = useToast();

  const handleRateMessage = async (rate: 'up' | 'down') => {
    const { success } = await rateMessage(publicId, rate, runId!);
    if (success) {
      setRated(rate === 'up' ? 1 : 0);
      infoToast({ message: t('thank-you') });
    } else {
      errorToast({ message: t('try-again') });
    }
  };

  const renderIcons = () => {
    switch (rated) {
      case 1:
        return <LikeIcon rated={rated} />;
      case 0:
        return <DislikeIcon rated={rated} />;
      case undefined:
      case null:
      default:
        return (
          <>
            <LikeIcon
              onClick={() => handleRateMessage('up')}
              rated={rated}
              style={{ cursor: 'pointer' }}
            />
            <DislikeIcon
              onClick={() => handleRateMessage('down')}
              rated={rated}
              style={{ cursor: 'pointer' }}
            />
          </>
        );
    }
  };

  useEffect(() => {
    setRated(initialRated);
  }, [initialRated]);

  return <>{renderIcons()}</>;
};
