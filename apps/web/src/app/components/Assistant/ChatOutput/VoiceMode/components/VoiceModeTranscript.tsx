import { Text } from '@ragenai/common-ui/Text';
import { type VoiceModeTranscriptProps } from '../types';

export const VoiceModeTranscript = ({ text }: VoiceModeTranscriptProps) => {
  return (
    <Text className="text-muted-foreground text-center max-w-md">
      {text}
    </Text>
  );
};
