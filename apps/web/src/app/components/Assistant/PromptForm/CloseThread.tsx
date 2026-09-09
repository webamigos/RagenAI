import { XMarkIcon } from '@ragenai/common-ui/icons';
import { Button } from '@ragenai/common-ui/Button';

type Props = {
  handleCloseThread: (redirect: boolean) => void;
};

export const CloseThread = ({ handleCloseThread }: Props) => {
  return (
    <Button
      className="p-1 bg-primary text-primary-foreground hover:bg-brand-700"
      onClick={() => handleCloseThread(true)}
      aria-label="Close thread"
    >
      <XMarkIcon className="text-gray-600" />
    </Button>
  );
};
