'use client';

import { useState, useRef, useEffect } from 'react';
import { PlayIcon, PauseIcon } from '@heroicons/react/24/outline';

import { logger } from '@/app/lib/utils/logger';

type AudioPlayerProps = {
  audioUrl: string;
  autoPlay?: boolean;
};

export const AudioPlayer = ({
  audioUrl,
  autoPlay = false,
}: AudioPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) {
      return;
    }

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    audioEl.addEventListener('play', handlePlay);
    audioEl.addEventListener('pause', handlePause);
    audioEl.addEventListener('ended', handleEnded);

    return () => {
      audioEl.removeEventListener('play', handlePlay);
      audioEl.removeEventListener('pause', handlePause);
      audioEl.removeEventListener('ended', handleEnded);
    };
  }, []);

  useEffect(() => {
    if (autoPlay && audioRef.current) {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          logger.error({ err: error }, 'Error playing audio');
        });
      }
    }
  }, [audioUrl, autoPlay]);

  const togglePlayPause = () => {
    if (!audioRef.current) {
      return;
    }
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  return (
    <div className="inline-flex items-center">
      <button
        onClick={togglePlayPause}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <PauseIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
        ) : (
          <PlayIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
        )}
      </button>
      <audio ref={audioRef} src={audioUrl} className="hidden" />
    </div>
  );
};
