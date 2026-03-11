'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useOrganization } from '@/app/hooks/use-auth';
import { PlayIcon, PauseIcon } from '@heroicons/react/24/outline';

import { Card } from '@ragenai/common-ui/Card';
import { classMerge } from '@ragenai/common-ui/utils/cn';
import { fetchVoiceId, updateVoiceId } from './actions';
import { toast } from 'sonner';
import { logger } from '@/app/lib/utils/logger';

const VOICE_OPTIONS = [
  {
    value: 'JBFqnCBsd6RMkjVDRZzb',
    label: 'George',
    description: 'warm-deep',
    sampleUrl:
      'https://storage.googleapis.com/eleven-public-prod/premade/voices/JBFqnCBsd6RMkjVDRZzb/e6206d1a-0721-4787-aafb-06a6e705cac5.mp3',
  },
  {
    value: '21m00Tcm4TlvDq8ikWAM',
    label: 'Rachel',
    description: 'calm-gentle',
    sampleUrl:
      'https://storage.googleapis.com/eleven-public-prod/premade/voices/21m00Tcm4TlvDq8ikWAM/d40b225f-0c4a-4fa4-a0be-e6964b5c9498.mp3',
  },
  {
    value: 'TxGEqnHWrfWFTfGW9XjX',
    label: 'Josh',
    description: 'deep-clear',
    sampleUrl:
      'https://storage.googleapis.com/eleven-public-prod/premade/voices/TxGEqnHWrfWFTfGW9XjX/07394e50-a2ff-4a5e-89b6-73eb87ccb449.mp3',
  },
  {
    value: 'EXAVITQu4vr4xnSDxMaL',
    label: 'Bella',
    description: 'soft-sweet',
    sampleUrl:
      'https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/6851ec91-9a09-4156-b9e2-1b3a8e197786.mp3',
  },
  {
    value: 'cgSgspJ2msm6clMCkdW9',
    label: 'Jessica',
    description: 'expressive-bright',
    sampleUrl:
      'https://storage.googleapis.com/eleven-public-prod/premade/voices/cgSgspJ2msm6clMCkdW9/56a97bf8-b69b-448f-846c-c3a11683d45a.mp3',
  },
];

export const VoiceModeSettings = () => {
  const t = useTranslations('assistant-settings.voice-mode-settings');
  const { organization } = useOrganization();
  const [selectedVoice, setSelectedVoice] = useState(VOICE_OPTIONS[0].value);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [audioEl] = useState(() =>
    typeof window !== 'undefined' ? new Audio() : null,
  );

  useEffect(() => {
    const getVoiceSettings = async () => {
      if (organization?.id) {
        const response = await fetchVoiceId(organization.id);
        if (response.success && response.data?.voiceId) {
          setSelectedVoice(response.data.voiceId);
        }
      }
    };
    getVoiceSettings();
  }, [organization?.id]);

  useEffect(() => {
    if (!audioEl) {
      return;
    }
    const handleEnded = () => setPlayingVoice(null);
    const handlePause = () => setPlayingVoice(null);
    audioEl.addEventListener('ended', handleEnded);
    audioEl.addEventListener('pause', handlePause);
    return () => {
      audioEl.removeEventListener('ended', handleEnded);
      audioEl.removeEventListener('pause', handlePause);
      audioEl.pause();
    };
  }, [audioEl]);

  const handleVoiceSelect = async (voiceId: string) => {
    if (organization?.id) {
      const response = await updateVoiceId(organization.id, voiceId);
      if (response.success) {
        setSelectedVoice(voiceId);
        toast.success(t('voice-updated'));
      } else {
        toast.error(t('voice-update-failed'));
      }
    }
  };

  const togglePreview = (voiceId: string, sampleUrl: string) => {
    if (!audioEl) {
      return;
    }
    if (playingVoice === voiceId) {
      audioEl.pause();
      setPlayingVoice(null);
    } else {
      audioEl.src = sampleUrl;
      setPlayingVoice(voiceId);
      audioEl.play().catch((err) => {
        setPlayingVoice(null);
        logger.error({ err }, 'Error playing voice sample');
      });
    }
  };

  return (
    <Card title={t('title')} size="full" collapsible defaultCollapsed>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t('voice-select')}
        </p>
        <div className="flex flex-wrap gap-3">
          {VOICE_OPTIONS.map((option) => {
            const isSelected = selectedVoice === option.value;
            const isPlaying = playingVoice === option.value;
            return (
              <div
                key={option.value}
                role="button"
                tabIndex={0}
                onClick={() => handleVoiceSelect(option.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleVoiceSelect(option.value);
                  }
                }}
                aria-pressed={isSelected}
                className={classMerge(
                  'relative flex flex-col items-center justify-center rounded-xl border-2 px-5 py-4 transition-all min-w-[110px] cursor-pointer',
                  isSelected
                    ? 'border-ragen-blue bg-blue-50/50 dark:border-blue-400 dark:bg-blue-950/30'
                    : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600',
                )}
              >
                <span
                  className={classMerge(
                    'text-sm font-medium',
                    isSelected
                      ? 'text-ragen-blue dark:text-blue-400'
                      : 'text-gray-700 dark:text-gray-200',
                  )}
                >
                  {option.label}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {t(`voice-description.${option.description}`)}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePreview(option.value, option.sampleUrl);
                  }}
                  className="mt-2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  aria-label={
                    isPlaying ? t('pause-preview') : t('play-preview')
                  }
                >
                  {isPlaying ? (
                    <PauseIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  ) : (
                    <PlayIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
};
