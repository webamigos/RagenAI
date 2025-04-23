import { Card } from '@ragenai/common-ui/Card';
import { getSubscriptionData } from './actions';
import { SubscriptionInfo } from './components/SubscribtionInfo';
import { getTranslations } from 'next-intl/server';
import { Container } from '@ragenai/common-ui/Container';
import { Header } from '@ragenai/common-ui/Header';

export default async function SubscriptionPage() {
  const subscription = await getSubscriptionData();
  const t = await getTranslations('subscription');

  if (!subscription) {
    return (
      <Card title={t('title')} size="full" className="mb-5">
        <p className="mt-4">{t('no-subscription')}</p>
      </Card>
    );
  }

  return (
    <Container size="2xl">
      <Header>{t('title')}</Header>
      <SubscriptionInfo subscription={subscription} />
    </Container>
  );
}
