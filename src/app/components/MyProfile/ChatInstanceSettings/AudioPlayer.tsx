'use client';

import { useState, useRef, useEffect } from 'react';
import { PlayIcon, PauseIcon } from '@heroicons/react/24/outline';
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
    if (autoPlay && audioRef.current) {
      audioRef.current.play();
    }
  }, [audioUrl, autoPlay]);

  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
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
      <audio
        ref={audioRef}
        src={audioUrl}
        onEnded={handleAudioEnded}
        className="hidden"
      />
    </div>
  );
};
