import { VoiceModeButtonProps } from '../types';
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
    if (isRecording)
      return 'animate-pulse bg-red-100 dark:bg-red-900 hover:bg-red-200 dark:hover:bg-red-800';
    if (isPlayingAudio) return 'animate-pulse bg-blue-100 dark:bg-blue-900';
    if (isWaitingForResponse) return 'bg-gray-100 dark:bg-gray-800';
    if (!isPlayingAudio && !isRecording && !isGeneratingAudio)
      return 'bg-gray-100 dark:bg-green-900 hover:bg-green-200 dark:hover:bg-green-800';
    return 'bg-gray-200 dark:bg-gray-800';
  };

  const getInnerCircleStyles = () => {
    if (isRecording) return 'bg-red-500';
    if (isPlayingAudio) return 'bg-blue-500';
    if (
      !isPlayingAudio &&
      !isRecording &&
      !isGeneratingAudio &&
      !isWaitingForResponse
    )
      return 'bg-green-500 dark:bg-green-600';
    return 'bg-gray-500 dark:bg-gray-700';
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
