import { useRef, useEffect } from 'react';
import { useVoiceMode } from './hooks/useVoiceMode';
import { VoiceModeButton } from './components/VoiceModeButton';
import { VoiceModeHeader } from './components/VoiceModeHeader';
import { VoiceModeStatus } from './components/VoiceModeStatus';
import { VoiceModeTranscript } from './components/VoiceModeTranscript';
import { VoiceModeInstructions } from './components/VoiceModeInstructions';
import { type VoiceModeProps } from './types';

export const VoiceMode = ({
  onClose,
  isRecording: initialIsRecording,
  onResult,
  messages,
  onMessagePlayed,
  voiceId,
  assistantError,
}: VoiceModeProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { state, handlers, voiceError } = useVoiceMode({
    audioRef,
    initialIsRecording,
    messages,
    onClose,
    onResult,
    onMessagePlayed,
    voiceId,
    assistantError,
  });

  const {
    hasApiError,
    isGeneratingAudio,
    isPlayingAudio,
    recordingTime,
    transcriptText,
    localIsRecording,
    isWaitingForResponse,
    error,
  } = state;

  // Handle Escape key to close voice mode
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isWaitingForResponse) {
        handlers.handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers, isWaitingForResponse]);

  return (
    <div className="fixed inset-0 bg-card z-50 flex flex-col items-center justify-center">
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
          error={error}
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
