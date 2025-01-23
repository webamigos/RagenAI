import { useState, useRef, useEffect } from 'react';

import { SpinnerSVG, SoundWave } from '@ragenai/common-ui';
import { PlayIcon, PauseIcon } from '@heroicons/react/24/outline';
import { logger } from '@/app/lib/utils/logger';

import { convertTextToSpeech } from '../elevenLabsTTS';

type ReadAnswerProps = {
  content: string;
};

export const ReadAnswer = ({ content }: ReadAnswerProps) => {
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlayAudio = async () => {
    if (!audioSrc) {
      setIsGenerating(true);
      try {
        const audioUrl = await convertTextToSpeech(content);
        setAudioSrc(audioUrl);
      } catch (error) {
        logger.error({ err: error }, 'Error while generating audio:');
      } finally {
        setIsGenerating(false);
      }
    } else {
      if (audioRef.current) {
        if (isPlaying) {
          audioRef.current.pause();
        } else {
          audioRef.current.play();
        }
      }
    }
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.onplay = () => setIsPlaying(true);
      audioRef.current.onpause = () => setIsPlaying(false);
      audioRef.current.onended = () => setIsPlaying(false);
    }
  }, [audioSrc]);

  const getAudioIcon = () => {
    if (isGenerating) {
      return <SpinnerSVG size="sm" className="ml-0.5" />;
    }

    if (!audioSrc) {
      return <SoundWave className="h-5 w-5" />;
    }

    return isPlaying ? (
      <PauseIcon className="h-5 w-5" />
    ) : (
      <PlayIcon className="h-5 w-5" />
    );
  };

  return (
    <>
      <button
        onClick={handlePlayAudio}
        disabled={isGenerating}
        className="transition-all"
      >
        {getAudioIcon()}
      </button>

      {audioSrc && (
        <audio ref={audioRef} src={audioSrc} autoPlay className="hidden" />
      )}
    </>
  );
};
