import { useState, useEffect, memo } from 'react';
import { useTranslations } from 'next-intl';

import { LikeIcon, DislikeIcon } from '@ragenai/common-ui/icons';
import { Tooltip } from '@ragenai/common-ui/Tooltip';
import { rateMessage } from '@/app/actions';
import { statusToast } from '@/app/lib/utils/toast';

const ACTION_BUTTON_CLS =
  'inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors';

type Props = {
  messageId: string;
  initialRated?: number | null;
};

export const RateAnswer = memo(({ messageId, initialRated }: Props) => {
  const [rated, setRated] = useState<number | null | undefined>(initialRated);

  const t = useTranslations('rate-answer');
  const { infoToast, errorToast } = statusToast();

  const handleRateMessage = async (rate: 'up' | 'down') => {
    const { success } = await rateMessage(messageId, rate);
    if (success) {
      setRated(rate === 'up' ? 1 : 0);
      infoToast({ message: t('thank-you') });
    } else {
      errorToast({ message: t('try-again') });
    }
  };

  useEffect(() => {
    setRated(initialRated);
  }, [initialRated]);

  if (rated === 1) {
    return <LikeIcon rated={rated} />;
  }

  if (rated === 0) {
    return <DislikeIcon rated={rated} />;
  }

  return (
    <>
      <Tooltip id={`like-${messageId}`} content={t('like')}>
        <button
          type="button"
          aria-label={t('like')}
          data-testid="rate-like-btn"
          className={ACTION_BUTTON_CLS}
          onClick={() => handleRateMessage('up')}
        >
          <LikeIcon rated={rated} />
        </button>
      </Tooltip>
      <Tooltip id={`dislike-${messageId}`} content={t('dislike')}>
        <button
          type="button"
          aria-label={t('dislike')}
          data-testid="rate-dislike-btn"
          className={ACTION_BUTTON_CLS}
          onClick={() => handleRateMessage('down')}
        >
          <DislikeIcon rated={rated} />
        </button>
      </Tooltip>
    </>
  );
});

RateAnswer.displayName = 'RateAnswer';
