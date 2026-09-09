import type Stripe from 'stripe';
import { Card } from '@ragenai/common-ui/Card';
import { Link } from '@ragenai/common-ui/Link';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';

type Props = {
  lineItem?: Stripe.LineItem;
  nextPaymentDate: Date;
  status: Stripe.Subscription.Status;
  invoiceUrl: string | null;
};

export const CheckoutSuccess = ({
  lineItem,
  nextPaymentDate,
  status,
  invoiceUrl,
}: Props) => {
  const t = useTranslations('subscription.checkout');
  return (
    <Card size="full" className="mb-5">
      <div className="flex flex-col gap-8">
        <div className="pt-4">
          <h1 className="text-2xl font-bold mb-1">{t('title')}</h1>
          <p>{t('description')}</p>
        </div>

        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground">
              {t('plan')}
            </h2>
            <p className="mt-1 text-lg font-semibold">
              {lineItem?.description}
            </p>
          </div>
          <div>
            <h2 className="text-sm font-medium text-muted-foreground">
              {t('next-payment-date')}
            </h2>
            <p className="mt-1 text-lg font-semibold">
              {format(nextPaymentDate, 'dd.MM.yyyy')}
            </p>
          </div>
          <div>
            <h2 className="text-sm font-medium text-muted-foreground">
              {t('status')}
            </h2>
            <p className="mt-1 text-lg font-semibold capitalize">
              <span
                className={`${
                  status === 'active' ? 'text-ready' : 'text-pending'
                }`}
              >
                {status}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          {invoiceUrl && (
            <Link href={invoiceUrl} target="_blank" rel="noopener noreferrer">
              {t('download-invoice')}
            </Link>
          )}

          <Link href="/my-profile/subscription">
            {t('manage-subscription')}
          </Link>
        </div>
      </div>
    </Card>
  );
};
