import { useTranslations } from 'next-intl';
import { Text } from '@ragenai/common-ui/Text';
import { type VoiceModeInstructionsProps } from '../types';

export const VoiceModeInstructions = ({
  hasApiError,
  voiceError,
}: VoiceModeInstructionsProps) => {
  const t = useTranslations('voice-mode');

  const getInstructionText = () => {
    if (hasApiError) {
      return t('api-error-instructions');
    }
    if (voiceError) {
      return t('voice-error-instructions');
    }
    return t('instructions');
  };

  return (
    <div className="space-y-4">
      <Text className="text-gray-500 dark:text-gray-400 text-center max-w-md">
        {getInstructionText()}
      </Text>

      {voiceError && (
        <Text className="text-red-500 text-center max-w-md font-medium">
          {voiceError}
        </Text>
      )}
    </div>
  );
};
