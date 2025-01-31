import { useTranslations } from 'next-intl';
import { Text } from '@ragenai/common-ui';
import { formatSecondsToMMSS } from '@/app/lib/utils/formatSecondsToMMSS';
import { VoiceModeStatusProps } from '../types';

export const VoiceModeStatus = ({
  isRecording,
  isGeneratingAudio,
  isPlayingAudio,
  recordingTime,
  isWaitingForResponse,
}: VoiceModeStatusProps) => {
  const t = useTranslations('voice-mode');

  const getStatusText = () => {
    switch (true) {
      case isRecording:
        return t('recording');
      case isGeneratingAudio:
        return t('generating');
      case isPlayingAudio:
        return t('playing');
      case isWaitingForResponse:
        return t('waiting-for-response');
      case !isPlayingAudio &&
        !isGeneratingAudio &&
        !isRecording &&
        !isWaitingForResponse:
        return t('ready-to-record');
      default:
        return t('waiting');
    }
  };

  return (
    <>
      <Text className="text-2xl font-semibold">{getStatusText()}</Text>
      {isRecording && (
        <Text className="text-xl font-mono">
          {formatSecondsToMMSS(recordingTime)}
        </Text>
      )}
    </>
  );
};
