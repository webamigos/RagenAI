import { PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { Button } from '@ragenai/common-ui/Button';

type Props = {
  disabled: boolean;
};

export const SendMessage = ({ disabled }: Props) => {
  return (
    <Button
      type="submit"
      className="bg-ready hover:bg-ready/90 disabled:bg-ready"
      disabled={disabled}
    >
      <PaperAirplaneIcon
        className="h-5 w-5 flex-none text-primary-foreground cursor-pointer"
        aria-hidden="true"
      />
    </Button>
  );
};
