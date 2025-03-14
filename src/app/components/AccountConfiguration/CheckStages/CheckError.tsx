import { Button } from '@ragenai/common-ui/Button';

type Props = Readonly<{
  tryAgainHandler: () => void;
}>;

export function CheckError({ tryAgainHandler }: Props) {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Account setup</h1>
      <p>
        An error occurred while checking for organization. Please try again.
      </p>
      <Button onClick={tryAgainHandler}>Try again</Button>
    </div>
  );
}
