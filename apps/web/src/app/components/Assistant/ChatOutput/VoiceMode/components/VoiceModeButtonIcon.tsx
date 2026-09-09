import {
  StopIcon,
  SpeakerWaveIcon,
  MicrophoneIcon,
} from '@heroicons/react/24/outline';
import { SpinnerSVG } from '@ragenai/common-ui/icons';

type VoiceModeButtonIconProps = {
  isRecording: boolean;
  isPlayingAudio: boolean;
  isGeneratingAudio: boolean;
  isWaitingForResponse: boolean;
};

export const VoiceModeButtonIcon = ({
  isRecording,
  isPlayingAudio,
  isGeneratingAudio,
  isWaitingForResponse,
}: VoiceModeButtonIconProps) => {
  if (isRecording) {
    return <StopIcon className="h-12 w-12 text-white" />;
  }

  if (isGeneratingAudio || isWaitingForResponse) {
    return <SpinnerSVG className="h-12 w-12 text-white dark:text-muted-foreground" />;
  }

  if (isPlayingAudio) {
    return <SpeakerWaveIcon className="h-12 w-12 text-white" />;
  }

  if (
    !isPlayingAudio &&
    !isGeneratingAudio &&
    !isRecording &&
    !isWaitingForResponse
  ) {
    return <MicrophoneIcon className="h-12 w-12 text-white animate-pulse" />;
  }

  return <MicrophoneIcon className="h-12 w-12 text-white dark:text-muted-foreground" />;
};
