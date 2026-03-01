import { useState } from 'react';
import { SpinnerSVG, SoundWave } from '@ragenai/common-ui/icons';
import { logger } from '@/app/lib/utils/logger';

import { convertTextToSpeech } from '../../elevenLabsTTS';
import { AudioPlayer } from '../../../MyProfile/ChatInstanceSettings/AudioPlayer';

type ReadAnswerProps = {
  content: string;
  voiceId: string;
};

export const ReadAnswer = ({ content, voiceId }: ReadAnswerProps) => {
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

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
      <button onClick={handleInitialClick} className="transition-all">
        <SoundWave className="h-5 w-5" />
      </button>
    );
  }

  return <AudioPlayer audioUrl={audioSrc} autoPlay />;
};
