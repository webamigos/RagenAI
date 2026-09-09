'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOrganization } from '@/app/hooks/use-auth';
import { PlayIcon, PauseIcon } from '@heroicons/react/24/outline';
import { classMerge } from '@ragenai/common-ui/utils/cn';
import {
  fetchVoiceId,
  updateVoiceId,
} from '@/app/components/MyProfile/ChatInstanceSettings/actions';
import { convertTextToSpeech } from '@/app/components/Assistant/elevenLabsTTS';
import { toast } from 'sonner';
import { logger } from '@/app/lib/utils/logger';

const VOICE_OPTIONS = [
  {
    value: 'JBFqnCBsd6RMkjVDRZzb',
    label: 'George',
    description: 'warm-storyteller',
  },
  {
    value: 'Xb7hH8MSUJpSbSDYk0k2',
    label: 'Alice',
    description: 'clear-educator',
  },
  {
    value: 'TX3LPaxmHKxFdv7VOQHJ',
    label: 'Liam',
    description: 'energetic-bright',
  },
  {
    value: 'pFZP5JQG7iQjIQuC4Bku',
    label: 'Lily',
    description: 'soft-elegant',
  },
];

export function VoiceSettings() {
  const t = useTranslations('assistant-settings.voice-mode-settings');
  const { organization } = useOrganization();
  const [selectedVoice, setSelectedVoice] = useState(VOICE_OPTIONS[0].value);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    audioRef.current = new Audio();
    const audio = audioRef.current;
    const handleEnded = () => setPlayingVoice(null);
    const handlePause = () => setPlayingVoice(null);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.pause();
      for (const url of blobUrlsRef.current.values()) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  useEffect(() => {
    const getVoiceSettings = async () => {
      if (organization?.id) {
        try {
          const response = await fetchVoiceId(organization.id);
          if (response.success && response.data?.voiceId) {
            setSelectedVoice(response.data.voiceId);
          }
        } catch (err) {
          logger.error({ err }, 'Error fetching voice settings');
        }
      }
    };
    getVoiceSettings();
  }, [organization?.id]);

  const handleVoiceSelect = useCallback(
    async (voiceId: string) => {
      if (organization?.id) {
        try {
          const response = await updateVoiceId(organization.id, voiceId);
          if (response.success) {
            setSelectedVoice(voiceId);
            toast.success(t('voice-updated'));
          } else {
            toast.error(t('voice-update-failed'));
          }
        } catch (err) {
          logger.error({ err }, 'Error updating voice setting');
          toast.error(t('voice-update-failed'));
        }
      }
    },
    [organization?.id, t],
  );

  const togglePreview = useCallback(
    async (voiceId: string) => {
      const audio = audioRef.current;
      if (!audio) {
        return;
      }
      if (playingVoice === voiceId) {
        audio.pause();
        setPlayingVoice(null);
        return;
      }

      const cached = blobUrlsRef.current.get(voiceId);
      if (cached) {
        audio.src = cached;
        setPlayingVoice(voiceId);
        audio.play().catch((err) => {
          setPlayingVoice(null);
          logger.error({ err }, 'Error playing voice sample');
        });
        return;
      }

      try {
        setLoadingVoice(voiceId);
        const sampleText = t('sample-text');
        const blobUrl = await convertTextToSpeech(sampleText, voiceId);
        blobUrlsRef.current.set(voiceId, blobUrl);
        audio.src = blobUrl;
        setPlayingVoice(voiceId);
        setLoadingVoice(null);
        audio.play().catch((err) => {
          setPlayingVoice(null);
          logger.error({ err }, 'Error playing voice sample');
        });
      } catch (err) {
        setLoadingVoice(null);
        logger.error({ err }, 'Error generating voice preview');
        toast.error(t('preview-failed'));
      }
    },
    [playingVoice, t],
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
      {VOICE_OPTIONS.map((option) => {
        const isSelected = selectedVoice === option.value;
        const isPlaying = playingVoice === option.value;
        const isLoading = loadingVoice === option.value;
        return (
          <div
            key={option.value}
            className={classMerge(
              'flex flex-col items-center justify-center gap-1 rounded-lg border px-5 py-4 text-sm transition-colors sm:min-w-[110px]',
              isSelected
                ? 'border-border bg-muted text-foreground'
                : 'border-border text-muted-foreground hover:border-border/90 hover:text-foreground',
            )}
          >
            <button
              type="button"
              onClick={() => handleVoiceSelect(option.value)}
              className="flex flex-col items-center gap-1 cursor-pointer"
            >
              <span className="font-medium">{option.label}</span>
              <span className="text-xs text-muted-foreground">
                {t(`voice-description.${option.description}`)}
              </span>
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => togglePreview(option.value)}
              className={classMerge(
                'mt-1 rounded-full p-1 hover:bg-muted dark:hover:bg-paper-700 transition-colors',
                isLoading && 'opacity-50 cursor-wait',
              )}
              aria-label={isPlaying ? t('pause-preview') : t('play-preview')}
            >
              {(() => {
                if (isLoading) {
                  return (
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  );
                }
                if (isPlaying) {
                  return <PauseIcon className="h-4 w-4" />;
                }
                return <PlayIcon className="h-4 w-4" />;
              })()}
            </button>
          </div>
        );
      })}
    </div>
  );
}
