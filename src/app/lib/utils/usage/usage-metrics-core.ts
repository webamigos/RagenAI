import { headers } from 'next/headers';
import { type Subscription } from '@/generated/prisma/client';

import { getOrgIdFromAuthOrThrow } from '../auth-helpers';
import { type PrismaClient } from '@/generated/prisma/client';
import { logger } from '../logger';
import { type UsageMetrics } from './types';
import { ApiKeysService } from '@/app/api/v1/__logic__/services/api-keys.service';
import { type ApiKey } from '@/app/api/v1/__logic__/types/brand';
import { API_HEADER } from '@/app/api/v1/__logic__/guards/api-key.guard';

// TODO: Reimplement usage period tracking — the UsagePeriod model was removed
// during the Better Auth Stripe migration. Usage metrics need a new storage
// approach (e.g., dedicated usage_periods table or Redis-based tracking).

export class UsageMetricsCore {
  private static instance: UsageMetricsCore;
  private dbClient: PrismaClient;

  constructor(dbClient: PrismaClient) {
    this.dbClient = dbClient;
  }

  public static getInstance(dbClient: PrismaClient): UsageMetricsCore {
    if (!UsageMetricsCore.instance) {
      UsageMetricsCore.instance = new UsageMetricsCore(dbClient);
    }
    return UsageMetricsCore.instance;
  }

  private async getOrganizationId(): Promise<string> {
    const headersList = await headers();
    const apiKeyHeaderValue = headersList.get(API_HEADER) as ApiKey;
    const apiKeysService = new ApiKeysService();

    if (apiKeyHeaderValue) {
      const { orgId } = apiKeysService.extractDataFromApiKey(apiKeyHeaderValue);
      return orgId;
    }

    const orgId = await getOrgIdFromAuthOrThrow();
    if (!orgId) {
      throw new Error("Can't track usage, organization ID not found");
    }

    return orgId;
  }

  private async getCurrentSubscription(): Promise<Subscription | null> {
    const organizationId = await this.getOrganizationId();
    return this.dbClient.subscription.findFirst({
      where: { referenceId: organizationId },
    });
  }

  async track(metric: keyof UsageMetrics, increment: number = 1) {
    const organizationId = await this.getOrganizationId();
    logger.debug({ organizationId, metric, increment }, 'Tracking usage');

    const subscription = await this.dbClient.subscription.findFirst({
      where: { referenceId: organizationId },
    });

    if (!subscription) {
      logger.warn(
        { organizationId },
        'Subscription not found for usage tracking',
      );
      return;
    }

    // TODO: Implement usage period tracking with new storage approach
    logger.debug(
      { subscriptionId: subscription.id, metric, increment },
      'Usage metric tracked (storage pending reimplementation)',
    );
  }

  async getCurrentPeriod(): Promise<Subscription | null> {
    const subscription = await this.getCurrentSubscription();
    if (!subscription) {
      return null;
    }

    return subscription;
  }
}
