import { Text } from '@ragenai/common-ui';
import { VoiceModeTranscriptProps } from '../types';

export const VoiceModeTranscript = ({ text }: VoiceModeTranscriptProps) => {
  return (
    <Text className="text-gray-600 dark:text-gray-300 text-center max-w-md">
      {text}
    </Text>
  );
};
