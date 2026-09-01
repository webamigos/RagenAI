import { getTranslations } from 'next-intl/server';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { requireOrgAdmin } from '@/lib/auth-guards';
import { OrgConnectorsView } from './OrgConnectorsView';
import { getOrgConnectorSettingsAction } from './actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const t = await getTranslations('Metadata');
  return { title: t('organization-connectors.title') };
}

export default async function OrgConnectorsPage() {
  const orgId = await getOrgIdFromAuthOrThrow();
  await requireOrgAdmin(orgId);

  const { available, orgEnabled } = await getOrgConnectorSettingsAction();

  return <OrgConnectorsView available={available} orgEnabled={orgEnabled} />;
}
