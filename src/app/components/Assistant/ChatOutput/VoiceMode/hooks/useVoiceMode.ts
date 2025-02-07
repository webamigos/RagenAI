import { useEffect, useReducer, RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { Role, MessageContentType } from '@prisma/client';
import { useVoiceInput } from '@/app/hooks/useAudioRecording';
import { convertTextToSpeech } from '../../../elevenLabsTTS';
import { logger } from '@/app/lib/utils/logger';
import { statusToast } from '@/app/lib/utils/toast';
import { updateMessagePlayedStatus } from '@/app/lib/services/message';
import { voiceModeReducer, initialState } from '../voiceModeReducer';
import { VoiceModeProps, VoiceModeHandlers } from '../types';

type UseVoiceModeProps = {
  audioRef: RefObject<HTMLAudioElement>;
  initialIsRecording: boolean;
  messages: VoiceModeProps['messages'];
  onClose: () => void;
  onResult: (text: string, recordingTime: number) => void;
  onMessagePlayed?: (messageId: string) => void;
};

export const useVoiceMode = ({
  audioRef,
  initialIsRecording,
  messages,
  onClose,
  onResult,
  onMessagePlayed,
}: UseVoiceModeProps) => {
  const [state, dispatch] = useReducer(voiceModeReducer, {
    ...initialState,
    currentMessages: messages,
    localIsRecording: initialIsRecording,
  });

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
    dispatch({ type: 'SET_LOCAL_RECORDING', payload: localIsRecording });
  }, [localIsRecording]);

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
    } else if (state.transcriptText.trim()) {
      onResult(state.transcriptText.trim(), state.recordingTime);
      dispatch({ type: 'RESET_RECORDING' });
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [localIsRecording, state.transcriptText, state.recordingTime]);

  useEffect(() => {
    const lastMessage = state.currentMessages[state.currentMessages.length - 1];
    if (
      lastMessage?.role === Role.ASSISTANT &&
      !lastMessage.voice_played &&
      lastMessage?.message_type === MessageContentType.VOICE
    ) {
      playAssistantResponse(lastMessage);
    }
  }, [state.currentMessages]);

  const playAssistantResponse = async (
    message: VoiceModeProps['messages'][0]
  ) => {
    dispatch({ type: 'SET_WAITING_FOR_RESPONSE', payload: true });
    dispatch({ type: 'SET_GENERATING_AUDIO', payload: true });

    try {
      const audioUrl = await convertTextToSpeech(message.content);

      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        dispatch({ type: 'SET_WAITING_FOR_RESPONSE', payload: false });
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

  const handlers: VoiceModeHandlers = {
    handleClose: () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      stopListening();
      onClose();
    },
    handleStopRecording: () => {
      stopListening();
    },
    handleStartRecording: () => {
      dispatch({ type: 'RESET_RECORDING' });
      dispatch({ type: 'SET_GENERATING_AUDIO', payload: false });
      dispatch({ type: 'SET_PLAYING_AUDIO', payload: false });
      startListening();
    },
  };

  return {
    state,
    handlers,
    voiceError,
  };
};
