'use client';

import { Progress } from '@/components/ui/progress';
import prettyBytes from 'pretty-bytes';

type Props = {
  usedBytes: number;
  limitBytes: number;
  label?: string;
  className?: string;
};

function useStorageProgress(usedBytes: number, limitBytes: number) {
  const percentage =
    limitBytes > 0 ? Math.min(100, (usedBytes / limitBytes) * 100) : 0;
  const isNearLimit = percentage > 80;
  const isOverLimit = percentage >= 100;
  const progressClassName = isOverLimit
    ? '[&>[data-slot=progress-indicator]]:bg-red-500'
    : isNearLimit
      ? '[&>[data-slot=progress-indicator]]:bg-amber-500'
      : '[&>[data-slot=progress-indicator]]:bg-blue-500';
  return { percentage, progressClassName };
}

export function StorageProgressBar({
  usedBytes,
  limitBytes,
  label,
  className,
}: Props) {
  const { percentage, progressClassName } = useStorageProgress(
    usedBytes,
    limitBytes,
  );

  return (
    <div className={className}>
      <Progress value={percentage} className={progressClassName} />
      <p className="text-xs text-muted-foreground mt-1">
        {label ?? `${Math.round(percentage)}% used`}
      </p>
    </div>
  );
}

export function StorageProgressBarDetailed({
  usedBytes,
  limitBytes,
  className,
}: Props) {
  const { percentage, progressClassName } = useStorageProgress(
    usedBytes,
    limitBytes,
  );

  return (
    <div className={className}>
      <Progress value={percentage} className={progressClassName} />
      <p className="text-xs text-muted-foreground mt-1">
        {prettyBytes(usedBytes)} / {prettyBytes(limitBytes)} used
      </p>
    </div>
  );
}
