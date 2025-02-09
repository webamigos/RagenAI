import { MicrophoneIcon } from '@heroicons/react/24/outline';

import { Text } from '@ragenai/common-ui/Text';
import { formatSecondsToMMSS } from '@/app/lib/utils/formatSecondsToMMSS';

type Props = {
  messageDurationTime: number;
};

export const DurationTime = ({ messageDurationTime }: Props) => {
  return (
    <div className="absolute top-8 -right-2 flex items-center">
      <MicrophoneIcon className="w-4 h-4" />
      <Text fontSize="sm">{formatSecondsToMMSS(messageDurationTime)}</Text>
    </div>
  );
};
