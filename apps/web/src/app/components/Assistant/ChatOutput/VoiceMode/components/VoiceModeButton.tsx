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
      return 'animate-pulse bg-crimson-50 hover:bg-crimson-50';
    }
    if (isPlayingAudio) {
      return 'animate-pulse bg-accent';
    }
    if (isWaitingForResponse) {
      return 'bg-muted';
    }
    if (!isPlayingAudio && !isRecording && !isGeneratingAudio) {
      return 'bg-muted hover:bg-ready-tint';
    }
    return 'bg-muted';
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
    return 'bg-muted-foreground dark:bg-muted';
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
