import { useEffect, useRef, useReducer } from 'react';
import { useTranslations } from 'next-intl';
import {
  XMarkIcon,
  StopIcon,
  SpeakerWaveIcon,
  MicrophoneIcon,
} from '@heroicons/react/24/outline';
import { Text, SpinnerSVG } from '@ragenai/common-ui';
import { useVoiceInput } from '@/app/hooks/useAudioRecording';
import { convertTextToSpeech } from '../../elevenLabsTTS';
import { Role, MessageType } from '@prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { statusToast } from '@/app/lib/utils/toast';
import { updateMessagePlayedStatus } from '@/app/lib/services/message';
import { formatSecondsToMMSS } from '@/app/lib/utils/formatSecondsToMMSS';
import { voiceModeReducer, initialState } from './voiceModeReducer';

type Props = {
  onClose: () => void;
  isRecording: boolean;
  onResult: (text: string, recordingTime: number) => void;
  messages: Array<{
    role: string;
    content: string;
    message_type?: MessageType;
    voice_played?: boolean;
    public_id?: string;
  }>;
  onMessagePlayed?: (messageId: string) => void;
};

export const VoiceMode = ({
  onClose,
  isRecording: initialIsRecording,
  onResult,
  messages,
  onMessagePlayed,
}: Props) => {
  const [state, dispatch] = useReducer(voiceModeReducer, {
    ...initialState,
    currentMessages: messages,
  });

  const {
    currentMessages,
    hasApiError,
    isGeneratingAudio,
    isPlayingAudio,
    recordingTime,
    transcriptText,
  } = state;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const t = useTranslations('voice-mode');
  const { errorToast } = statusToast();

  const {
    startListening,
    stopListening,
    isRecording: localIsRecording,
    error: voiceError,
  } = useVoiceInput({
    onResult: (text) => {
      dispatch({ type: 'SET_TRANSCRIPT_TEXT', payload: text });
    },
  });

  useEffect(() => {
    dispatch({ type: 'UPDATE_MESSAGES', payload: messages });
  }, [messages]);

  useEffect(() => {
    if (initialIsRecording) {
      startListening();
    }
  }, [initialIsRecording]);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (localIsRecording) {
      interval = setInterval(() => {
        dispatch({ type: 'INCREMENT_RECORDING_TIME' });
      }, 1000);
    } else {
      if (transcriptText.trim()) {
        onResult(transcriptText.trim(), recordingTime);
        dispatch({ type: 'RESET_RECORDING' });
      }
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [localIsRecording, transcriptText, recordingTime]);

  useEffect(() => {
    const lastMessage = currentMessages[currentMessages.length - 1];
    if (
      lastMessage?.role === Role.ASSISTANT &&
      lastMessage.message_type === 'VOICE' &&
      !lastMessage.voice_played &&
      !hasApiError
    ) {
      playAssistantResponse(lastMessage);
    }
  }, [currentMessages, hasApiError]);

  const playAssistantResponse = async (message: (typeof messages)[0]) => {
    dispatch({ type: 'SET_GENERATING_AUDIO', payload: true });

    try {
      const audioUrl = await convertTextToSpeech(message.content);

      if (audioRef.current) {
        audioRef.current.src = audioUrl;

        dispatch({ type: 'SET_GENERATING_AUDIO', payload: false });
        dispatch({ type: 'SET_PLAYING_AUDIO', payload: true });

        audioRef.current.play();

        if (message.public_id) {
          await updateMessagePlayedStatus(message.public_id);
          dispatch({
            type: 'UPDATE_MESSAGE_PLAYED_STATUS',
            payload: message.public_id,
          });

          if (onMessagePlayed) {
            onMessagePlayed(message.public_id);
          }
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Error while generating audio:');
      dispatch({ type: 'SET_API_ERROR', payload: true });
      errorToast({
        message: t('api-error'),
      });
      startListening();
    } finally {
      dispatch({ type: 'SET_GENERATING_AUDIO', payload: false });
    }
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.onplay = () =>
        dispatch({ type: 'SET_PLAYING_AUDIO', payload: true });
      audioRef.current.onpause = () =>
        dispatch({ type: 'SET_PLAYING_AUDIO', payload: false });
      audioRef.current.onended = () => {
        dispatch({ type: 'SET_PLAYING_AUDIO', payload: false });
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

  const handleStartRecording = () => {
    dispatch({ type: 'RESET_RECORDING' });
    dispatch({ type: 'SET_GENERATING_AUDIO', payload: false });
    dispatch({ type: 'SET_PLAYING_AUDIO', payload: false });
    startListening();
  };

  const getStatusText = () => {
    switch (true) {
      case localIsRecording:
        return t('recording');
      case isGeneratingAudio:
        return t('generating');
      case transcriptText.trim() !== '':
        return t('waiting-for-response');
      case isPlayingAudio:
        return t('playing');
      default:
        return t('waiting');
    }
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
          onClick={
            localIsRecording ? handleStopRecording : handleStartRecording
          }
          className={`w-32 h-32 rounded-full flex items-center justify-center transition-all ${
            localIsRecording
              ? 'animate-pulse bg-red-100 dark:bg-red-900 hover:bg-red-200 dark:hover:bg-red-800'
              : isPlayingAudio
              ? 'animate-pulse bg-blue-100 dark:bg-blue-900'
              : 'bg-green-500 dark:bg-gray-800'
          }`}
        >
          <div
            className={`w-24 h-24 rounded-full flex items-center justify-center ${
              localIsRecording
                ? 'bg-red-500'
                : isPlayingAudio
                ? 'bg-blue-500'
                : 'bg-green-500 dark:bg-gray-700'
            }`}
          >
            {localIsRecording && <StopIcon className="h-12 w-12 text-white" />}
            {isGeneratingAudio && <SpinnerSVG className="h-12 w-12" />}
            {isPlayingAudio && (
              <SpeakerWaveIcon className="h-12 w-12 text-white" />
            )}
            {!localIsRecording && !isGeneratingAudio && !isPlayingAudio && (
              <MicrophoneIcon className="h-12 w-12 text-white dark:text-gray-400" />
            )}
          </div>
        </button>

        <Text className="text-2xl font-semibold">{getStatusText()}</Text>

        {localIsRecording && (
          <Text className="text-xl font-mono">
            {formatSecondsToMMSS(recordingTime)}
          </Text>
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
