import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from '@heroicons/react/20/solid';
import { classMerge } from '../utils/cn';

type ALERT_TYPE = 'warning' | 'error' | 'success' | 'info';

type Props = {
  title: string | React.ReactNode;
  type?: ALERT_TYPE;
  titleBold?: boolean;
  description?: string;
  showLeftBorder?: boolean;
};

const palette: Record<
  ALERT_TYPE,
  {
    borderColor: string;
    backgroundColor: string;
    textColor: string;
    textColorBold: string;
    textColorDescription: string;
    icon: React.ReactNode;
  }
> = {
  warning: {
    borderColor: 'border-pending',
    backgroundColor: 'bg-pending-tint dark:bg-card',
    textColor: 'text-pending',
    textColorBold: 'text-pending',
    textColorDescription: 'text-pending',
    icon: (
      <ExclamationTriangleIcon
        className="h-5 w-5 text-pending"
        aria-hidden="true"
      />
    ),
  },
  success: {
    borderColor: 'border-ready',
    backgroundColor: 'bg-ready-tint dark:bg-card',
    textColor: 'text-ready',
    textColorBold: 'text-ready',
    textColorDescription: 'text-ready',
    icon: <CheckCircleIcon className="h-5 w-5 text-ready" aria-hidden="true" />,
  },
  error: {
    borderColor: 'border-destructive',
    backgroundColor: 'bg-crimson-50 dark:bg-card',
    textColor: 'text-destructive',
    textColorBold: 'text-destructive',
    textColorDescription: 'text-destructive',
    icon: (
      <XCircleIcon className="h-5 w-5 text-destructive" aria-hidden="true" />
    ),
  },
  info: {
    borderColor: 'border-primary',
    backgroundColor: 'bg-accent dark:bg-card',
    textColor: 'text-primary',
    textColorBold: 'text-primary',
    textColorDescription: 'text-primary',
    icon: (
      <InformationCircleIcon
        className="h-5 w-5 text-primary"
        aria-hidden="true"
      />
    ),
  },
};

export const Alert = ({
  title,
  type = 'success',
  titleBold = true,
  description = '',
  showLeftBorder = true,
}: Props) => {
  return (
    <div
      className={classMerge(
        palette[type].borderColor,
        palette[type].backgroundColor,
        'my-4 p-4',

        { 'border-l-4': showLeftBorder },
      )}
    >
      <div className="flex">
        <div className="shrink-0">{palette[type].icon}</div>
        <div className="ml-3">
          <h3
            className={classMerge(`text-sm`, palette[type].textColorBold, {
              'font-medium': titleBold,
            })}
          >
            {title}
          </h3>

          {description && (
            <div
              className={`mt-2 text-sm ${palette[type].textColorDescription}`}
            >
              <p>{description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
