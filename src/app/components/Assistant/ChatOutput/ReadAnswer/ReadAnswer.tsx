import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SpinnerSVG, SoundWave } from '@ragenai/common-ui/icons';
import { Tooltip } from '@ragenai/common-ui/Tooltip';
import { logger } from '@/app/lib/utils/logger';

import { convertTextToSpeech } from '../../elevenLabsTTS';
import { AudioPlayer } from '../../../MyProfile/ChatInstanceSettings/AudioPlayer';

const ACTION_BUTTON_CLS =
  'inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors';

type ReadAnswerProps = {
  content: string;
  voiceId: string;
  messageId: string;
};

export const ReadAnswer = ({
  content,
  voiceId,
  messageId,
}: ReadAnswerProps) => {
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const t = useTranslations('read-answer');

  const handleInitialClick = async () => {
    if (!audioSrc && !isGenerating) {
      setIsGenerating(true);
      try {
        const audioUrl = await convertTextToSpeech(content, voiceId);
        setAudioSrc(audioUrl);
      } catch (error) {
        logger.error({ err: error }, 'Error while generating audio:');
      } finally {
        setIsGenerating(false);
      }
    }
  };

  if (isGenerating) {
    return <SpinnerSVG size="sm" className="ml-0.5" />;
  }

  if (!audioSrc) {
    return (
      <Tooltip id={`read-answer-${messageId}`} content={t('listen')}>
        <button
          type="button"
          data-testid="read-answer-btn"
          onClick={handleInitialClick}
          className={ACTION_BUTTON_CLS}
        >
          <SoundWave className="h-5 w-5" />
        </button>
      </Tooltip>
    );
  }

  return <AudioPlayer audioUrl={audioSrc} autoPlay />;
};
