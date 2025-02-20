import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useVoiceMode } from './hooks/useVoiceMode';
import { VoiceModeButton } from './components/VoiceModeButton';
import { VoiceModeHeader } from './components/VoiceModeHeader';
import { VoiceModeStatus } from './components/VoiceModeStatus';
import { VoiceModeTranscript } from './components/VoiceModeTranscript';
import { VoiceModeInstructions } from './components/VoiceModeInstructions';
import { VoiceModeProps } from './types';

export const VoiceMode = ({
  onClose,
  isRecording: initialIsRecording,
  onResult,
  messages,
  onMessagePlayed,
  voiceId,
}: VoiceModeProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const t = useTranslations('voice-mode');

  const { state, handlers, voiceError } = useVoiceMode({
    audioRef,
    initialIsRecording,
    messages,
    onClose,
    onResult,
    onMessagePlayed,
    voiceId,
  });

  const {
    hasApiError,
    isGeneratingAudio,
    isPlayingAudio,
    recordingTime,
    transcriptText,
    localIsRecording,
    isWaitingForResponse,
  } = state;

  return (
    <div className="fixed inset-0 bg-white dark:bg-secondary-dark z-50 flex flex-col items-center justify-center">
      <VoiceModeHeader
        disabled={isWaitingForResponse}
        onClose={handlers.handleClose}
      />

      <div className="flex flex-col items-center space-y-8">
        <VoiceModeButton
          isWaitingForResponse={isWaitingForResponse}
          isRecording={localIsRecording}
          isPlayingAudio={isPlayingAudio}
          isGeneratingAudio={isGeneratingAudio}
          onStartRecording={handlers.handleStartRecording}
          onStopRecording={handlers.handleStopRecording}
        />

        <VoiceModeStatus
          isRecording={localIsRecording}
          isGeneratingAudio={isGeneratingAudio}
          isPlayingAudio={isPlayingAudio}
          recordingTime={recordingTime}
          isWaitingForResponse={isWaitingForResponse}
        />

        {transcriptText && <VoiceModeTranscript text={transcriptText} />}

        <VoiceModeInstructions
          hasApiError={hasApiError}
          voiceError={voiceError}
        />
      </div>

      <audio ref={audioRef} className="hidden" />
    </div>
  );
};
