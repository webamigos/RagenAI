import { headers } from 'next/headers';
import { UsagePeriod } from '@prisma/client';

import { getOrgIdFromAuthOrThrow } from '../auth-helpers';
import { PrismaClient } from '@prisma/client';
import { logger } from '../logger';
import { UsageMetrics } from './types';
import { addMonths } from 'date-fns';
import { ApiKeysService } from '@/app/api/v1/__logic__/services/api-keys.service';
import { ApiKey } from '@/app/api/v1/__logic__/types/brand';
import { API_HEADER } from '@/app/api/v1/__logic__/guards/api-key.guard';

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

  private async createUsagePeriod(
    subscriptionId: number
  ): Promise<UsagePeriod | null> {
    // Get subscription to determine period dates
    const subscription = await this.dbClient.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      logger.warn({ subscriptionId }, 'Subscription not found');
      return null;
    }

    // Find the most recent usage period for this subscription
    const lastPeriod = await this.dbClient.usagePeriod.findFirst({
      where: { subscription_id: subscriptionId },
      orderBy: { end_date: 'desc' },
    });

    // If there's an active period, return it
    if (lastPeriod && lastPeriod.end_date >= new Date()) {
      return lastPeriod;
    }

    let startDate: Date;
    if (lastPeriod) {
      // If there was a previous period, start immediately after it
      startDate = lastPeriod.end_date;
    } else {
      // For first period, calculate based on subscription start
      const now = new Date();
      const subscriptionStart = subscription.current_period_start;

      // Calculate how many months have elapsed
      const monthsDiff =
        (now.getFullYear() - subscriptionStart.getFullYear()) * 12 +
        (now.getMonth() - subscriptionStart.getMonth());

      // Set start date to the beginning of the current period
      startDate = addMonths(subscriptionStart, monthsDiff);

      // If we calculated a start date in the future, go back one period
      if (startDate > now) {
        startDate = addMonths(startDate, -1);
      }
    }

    // End date is one month after start
    const endDate = addMonths(startDate, 1);

    return this.dbClient.usagePeriod.create({
      data: {
        subscription_id: subscriptionId,
        start_date: startDate,
        end_date: endDate,
        metrics: {},
      },
    });
  }

  private async getCurrentUsagePeriod(
    subscriptionId: number
  ): Promise<UsagePeriod | null> {
    const currentPeriod = await this.dbClient.usagePeriod.findFirst({
      where: {
        subscription_id: subscriptionId,
        start_date: { lte: new Date() },
        end_date: { gte: new Date() },
      },
      orderBy: { end_date: 'desc' },
    });

    return currentPeriod;
  }

  private async getCurrentSubscription() {
    const organizationId = await this.getOrganizationId();
    const org = await this.dbClient.organization.findUnique({
      where: { provider_id: organizationId },
      include: { subscription: true },
    });

    return org?.subscription || null;
  }

  private async incrementMetric(
    subscriptionId: number,
    metricPath: keyof UsageMetrics,
    value: number = 1
  ) {
    let currentPeriod = await this.getCurrentUsagePeriod(subscriptionId);
    if (!currentPeriod) {
      currentPeriod = await this.createUsagePeriod(subscriptionId);
    }

    if (!currentPeriod) {
      logger.warn({ subscriptionId }, 'Usage period not found');
      return;
    }

    await this.dbClient.$transaction(async (dbClient) => {
      //To avoid issues with concurrent updates, we use atomic updateds on postgres database
      await dbClient.$executeRaw`
          UPDATE "UsagePeriod"
          SET metrics = jsonb_set(
            COALESCE(metrics, '{}'::jsonb),
            array[${metricPath}]::text[],
            (
              COALESCE(
                (metrics #>> array[${metricPath}]::text[])::numeric,
                '0'
              )::numeric + ${value}
            )::text::jsonb
          )
          WHERE id = ${currentPeriod?.id}
        `;
    });
  }

  async track(metric: keyof UsageMetrics, increment: number = 1) {
    const organizationId = await this.getOrganizationId();
    logger.info({ organizationId, metric, increment }, 'Tracking usage');

    // Get current subscription for the organization
    const org = await this.dbClient.organization.findUnique({
      where: { provider_id: organizationId },
      include: { subscription: true },
    });

    if (org?.subscription?.id) {
      await this.incrementMetric(org.subscription.id, metric, increment);
    } else {
      logger.warn({ organizationId }, 'Subscription not found');
    }
  }

  async getCurrentPeriod(): Promise<UsagePeriod | null> {
    const subscription = await this.getCurrentSubscription();
    if (!subscription?.id) {
      return null;
    }

    return this.getCurrentUsagePeriod(subscription.id);
  }
}
