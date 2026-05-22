'use server';

import { getOrgIdFromAuthOrThrow } from '../lib/utils/auth-helpers';
import {
  getCreditsSummaryQuery,
  type CreditsSummary,
} from '@/features/credits/services/queries/get-credits-summary-query';

export async function getCreditsSummary(): Promise<CreditsSummary> {
  const organizationId = await getOrgIdFromAuthOrThrow();
  return getCreditsSummaryQuery(organizationId);
}
