import { XMarkIcon } from '@heroicons/react/24/outline';
import { VoiceModeHeaderProps } from '../types';

export const VoiceModeHeader = ({ onClose }: VoiceModeHeaderProps) => {
  return (
    <button
      onClick={onClose}
      className="absolute top-4 right-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
    >
      <XMarkIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
    </button>
  );
};
