import { PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { Button } from '@ragenai/common-ui/Button';

type Props = {
  disabled: boolean;
};

export const SendMessage = ({ disabled }: Props) => {
  return (
    <Button
      type="submit"
      className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400"
      disabled={disabled}
    >
      <PaperAirplaneIcon
        className="h-5 w-5 flex-none text-white cursor-pointer"
        aria-hidden="true"
      />
    </Button>
  );
};
