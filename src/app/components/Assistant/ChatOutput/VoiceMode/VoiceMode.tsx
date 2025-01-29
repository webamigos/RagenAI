import { useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
  XMarkIcon,
  StopIcon,
  SpeakerWaveIcon,
} from '@heroicons/react/24/outline';
import { Text, SpinnerSVG } from '@ragenai/common-ui';
import { useVoiceInput } from '@/app/hooks/useAudioRecording';
import { convertTextToSpeech } from '../../elevenLabsTTS';
import { Role } from '@prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { statusToast } from '@/app/lib/utils/toast';

type Props = {
  onClose: () => void;
  isRecording: boolean;
  onResult: (text: string) => void;
  messages: Array<{ role: string; content: string }>;
};

export const VoiceMode = ({
  onClose,
  isRecording: initialIsRecording,
  onResult,
  messages,
}: Props) => {
  const t = useTranslations('voice-mode');
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcriptText, setTranscriptText] = useState('');
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [hasApiError, setHasApiError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { errorToast } = statusToast();

  const {
    startListening,
    stopListening,
    isRecording: localIsRecording,
    error: voiceError,
  } = useVoiceInput({
    onResult: (text) => {
      setTranscriptText(text);
    },
  });

  useEffect(() => {
    if (initialIsRecording) {
      startListening();
    }
  }, [initialIsRecording]);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (localIsRecording) {
      interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingTime(0);
      if (transcriptText.trim()) {
        onResult(transcriptText.trim());
        setTranscriptText('');
      }
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [localIsRecording]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === Role.ASSISTANT && !hasApiError) {
      playAssistantResponse(lastMessage.content);
    }
  }, [messages, hasApiError]);

  const playAssistantResponse = async (text: string) => {
    setIsGeneratingAudio(true);
    try {
      const audioUrl = await convertTextToSpeech(text);
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.play();
      }
    } catch (error) {
      logger.error({ err: error }, 'Error while generating audio:');
      setHasApiError(true);
      errorToast({
        message: t('api-error'),
      });
      startListening();
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.onplay = () => setIsPlayingAudio(true);
      audioRef.current.onpause = () => setIsPlayingAudio(false);
      audioRef.current.onended = () => {
        setIsPlayingAudio(false);
        startListening();
      };
    }
  }, []);

  const handleClose = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    stopListening();
    onClose();
  };

  const handleStopRecording = () => {
    stopListening();
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-white dark:bg-secondary-dark z-50 flex flex-col items-center justify-center">
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
      >
        <XMarkIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
      </button>

      <div className="flex flex-col items-center space-y-8">
        <button
          onClick={handleStopRecording}
          className={`w-32 h-32 rounded-full flex items-center justify-center transition-all ${
            localIsRecording
              ? 'animate-pulse bg-red-100 dark:bg-red-900 hover:bg-red-200 dark:hover:bg-red-800'
              : isPlayingAudio
              ? 'animate-pulse bg-blue-100 dark:bg-blue-900'
              : 'bg-gray-100 dark:bg-gray-800'
          }`}
        >
          <div
            className={`w-24 h-24 rounded-full flex items-center justify-center ${
              localIsRecording
                ? 'bg-red-500'
                : isPlayingAudio
                ? 'bg-blue-500'
                : 'bg-gray-300 dark:bg-gray-700'
            }`}
          >
            {localIsRecording && <StopIcon className="h-12 w-12 text-white" />}
            {isGeneratingAudio && <SpinnerSVG className="h-12 w-12" />}
            {isPlayingAudio && (
              <SpeakerWaveIcon className="h-12 w-12 text-white" />
            )}
          </div>
        </button>

        <Text className="text-2xl font-semibold">
          {localIsRecording
            ? t('recording')
            : isGeneratingAudio
            ? t('generating')
            : isPlayingAudio
            ? t('playing')
            : t('waiting')}
        </Text>

        {localIsRecording && (
          <Text className="text-xl font-mono">{formatTime(recordingTime)}</Text>
        )}

        {transcriptText && (
          <Text className="text-gray-600 dark:text-gray-300 text-center max-w-md">
            {transcriptText}
          </Text>
        )}

        <Text className="text-gray-500 dark:text-gray-400 text-center max-w-md">
          {hasApiError ? t('api-error-instructions') : t('instructions')}
        </Text>

        {voiceError && (
          <Text className="text-red-500 text-center max-w-md">
            {voiceError}
          </Text>
        )}
      </div>

      <audio ref={audioRef} className="hidden" />
    </div>
  );
};
