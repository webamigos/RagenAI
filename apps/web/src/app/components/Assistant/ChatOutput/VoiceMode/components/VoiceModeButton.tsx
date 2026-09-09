import { type VoiceModeButtonProps } from '../types';
import { VoiceModeButtonIcon } from './VoiceModeButtonIcon';

export const VoiceModeButton = ({
  isRecording,
  isPlayingAudio,
  isGeneratingAudio,
  isWaitingForResponse,
  onStartRecording,
  onStopRecording,
}: VoiceModeButtonProps) => {
  const getButtonStyles = () => {
    if (isRecording) {
      return 'animate-pulse bg-crimson-50 dark:bg-crimson-950/30 hover:bg-crimson-50/90 dark:hover:bg-crimson-950/50';
    }
    if (isPlayingAudio) {
      return 'animate-pulse bg-accent dark:bg-primary/15';
    }
    if (isWaitingForResponse) {
      return 'bg-muted';
    }
    if (!isPlayingAudio && !isRecording && !isGeneratingAudio) {
      return 'bg-muted dark:bg-ready/15 hover:bg-ready-tint dark:hover:bg-ready/25';
    }
    return 'bg-paper-200 dark:bg-muted';
  };

  const getInnerCircleStyles = () => {
    if (isRecording) {
      return 'bg-destructive';
    }
    if (isPlayingAudio) {
      return 'bg-primary';
    }
    if (
      !isPlayingAudio &&
      !isRecording &&
      !isGeneratingAudio &&
      !isWaitingForResponse
    ) {
      return 'bg-ready';
    }
    return 'bg-paper-500 dark:bg-paper-700';
  };

  return (
    <button
      onClick={isRecording ? onStopRecording : onStartRecording}
      disabled={isGeneratingAudio || isPlayingAudio || isWaitingForResponse}
      className={`w-32 h-32 rounded-full flex items-center justify-center transition-all ${getButtonStyles()}`}
    >
      <div
        className={`w-24 h-24 rounded-full flex items-center justify-center ${getInnerCircleStyles()}`}
      >
        <VoiceModeButtonIcon
          isRecording={isRecording}
          isPlayingAudio={isPlayingAudio}
          isGeneratingAudio={isGeneratingAudio}
          isWaitingForResponse={isWaitingForResponse}
        />
      </div>
    </button>
  );
};
