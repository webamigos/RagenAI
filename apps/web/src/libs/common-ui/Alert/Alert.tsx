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
  /**
   * Design system v2 reserves green and amber for document and job state, and
   * gives crimson five jobs that do not include an alert. Rather than invent a
   * sixth palette, these reuse the state vocabulary the rest of the panel uses
   * — `ready` and `pending` are exactly "this went well" and "look at this" —
   * with crimson for error and brand for information.
   *
   * The dark variants are gone: the tints are token-driven now, so one value
   * works in both themes.
   */
  warning: {
    borderColor: 'border-pending',
    backgroundColor: 'bg-pending-tint',
    textColor: 'text-pending',
    textColorBold: 'text-foreground',
    textColorDescription: 'text-muted-foreground',
    icon: (
      <ExclamationTriangleIcon
        className="h-5 w-5 text-pending"
        aria-hidden="true"
      />
    ),
  },
  success: {
    borderColor: 'border-ready',
    backgroundColor: 'bg-ready-tint',
    textColor: 'text-ready',
    textColorBold: 'text-foreground',
    textColorDescription: 'text-muted-foreground',
    icon: <CheckCircleIcon className="h-5 w-5 text-ready" aria-hidden="true" />,
  },
  error: {
    borderColor: 'border-crimson-300',
    backgroundColor: 'bg-crimson-50',
    textColor: 'text-crimson-600',
    textColorBold: 'text-foreground',
    textColorDescription: 'text-muted-foreground',
    icon: (
      <XCircleIcon className="h-5 w-5 text-crimson-600" aria-hidden="true" />
    ),
  },
  info: {
    borderColor: 'border-brand-300',
    backgroundColor: 'bg-brand-50',
    textColor: 'text-primary',
    textColorBold: 'text-foreground',
    textColorDescription: 'text-muted-foreground',
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
