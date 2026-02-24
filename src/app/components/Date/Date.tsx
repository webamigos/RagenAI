import { classMerge } from '@ragenai/common-ui/utils/cn';
import { utcToZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';

const displayDate = (date: Date) => {
  // not working with date-fns v3 yet (https://github.com/marnusw/date-fns-tz/issues/260)
  const zonedDate = utcToZonedTime(date, 'Europe/Warsaw');
  return format(zonedDate, 'dd.MM.yyyy HH:mm:ss');
};

type Props = {
  children: Date;
  className?: string;
};

export const Date = ({ children, className }: Props) => {
  return (
    <p
      className={classMerge('mt-1 text-xs leading-5 text-gray-500', className)}
    >
      <div className="flex">
        <span>{displayDate(children)}</span>
      </div>
    </p>
  );
};
