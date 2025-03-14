import { SpinnerSVG } from '@ragenai/common-ui/icons';

export function InProgress() {
  return (
    <div className="flex items-center gap-2">
      <p>Checking for organization...</p>
      <SpinnerSVG size="sm" />
    </div>
  );
}
