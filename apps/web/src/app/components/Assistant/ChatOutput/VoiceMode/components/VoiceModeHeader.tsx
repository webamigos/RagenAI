import { XMarkIcon } from '@heroicons/react/24/outline';
import { type VoiceModeHeaderProps } from '../types';

export const VoiceModeHeader = ({
  onClose,
  disabled,
}: VoiceModeHeaderProps) => {
  return (
    <button
      onClick={onClose}
      disabled={disabled}
      className="absolute top-4 right-4 p-2 hover:bg-muted rounded-full disabled:cursor-not-allowed"
    >
      <XMarkIcon className="h-6 w-6 text-muted-foreground" />
    </button>
  );
};
