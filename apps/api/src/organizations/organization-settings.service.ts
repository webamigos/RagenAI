import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { decryptApiKey } from './hash-api-key.js';
import {
  generateThreadKey,
  decryptThreadKey,
} from '../crypto/thread-encryption.js';
import {
  defaultOrganizationSettings,
  defaultRagPipelineSettings,
  defaultStorageLimits,
} from './constants.js';
import {
  type RagPipelineSettings,
  type RawOrganizationSettings,
  type StorageLimits,
  type UsageLimits,
} from './types.js';

/**
 * Ported from apps/web's
 * src/features/organizations/services/organization-settings.ts — that file
 * is a 900+ line grab-bag covering every org setting (allowed models,
 * connectors, templates, LiteLLM team provisioning, PII DEK management,
 * ...). This carries the read-only closure this and the MCP-tool-loading
 * slice actually need: getUsageLimits, getRagPipelineSettings,
 * getAllSettings, getLiteLLMOrgApiKey, getAllowedConnectors,
 * getDefaultAllowedConnectors, getStorageLimits, and the private
 * getSettings() / getApiKeyFromPool() / resolveOrgModel() helpers they
 * depend on. See docs/adrs/21-monorepo-and-api-decoupling.md.
 */
@Injectable()
export class OrganizationSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getSettings(orgId: string) {
    return this.prisma.client.organizationSettings.findUnique({
      where: { organizationId: orgId },
    });
  }

  private async upsertSettings(
    orgId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.client.organizationSettings.upsert({
      where: { organizationId: orgId },
      update: data,
      create: { organizationId: orgId, ...data },
    });
  }

  /**
   * Added when closing the dual-content PII decode gap flagged in the MCP
   * slice (see docs/adrs/21-monorepo-and-api-decoupling.md) —
   * `chains/basic-rag/dual-content-decode.ts` needs this to decrypt
   * `pii_mode: 'dual_content'` chunks back to their real content at
   * retrieval time. Race-safe the same way `PersistApiThreadService`'s
   * per-thread DEK init is: conditional update, re-fetch on lost race.
   */
  async getOrCreatePiiDek(orgId: string): Promise<Buffer> {
    const settings = await this.getSettings(orgId);
    if (settings?.encryptedPiiDek) {
      return decryptThreadKey(settings.encryptedPiiDek);
    }

    const { plaintextDek, encryptedDek } = await generateThreadKey();

    if (settings) {
      const result = await this.prisma.client.organizationSettings.updateMany({
        where: { organizationId: orgId, encryptedPiiDek: null },
        data: { encryptedPiiDek: encryptedDek },
      });
      if (result.count === 0) {
        const updated =
          await this.prisma.client.organizationSettings.findUniqueOrThrow({
            where: { organizationId: orgId },
            select: { encryptedPiiDek: true },
          });
        if (!updated.encryptedPiiDek) {
          throw new Error('Failed to initialize PII encryption key');
        }
        return decryptThreadKey(updated.encryptedPiiDek);
      }
    } else {
      await this.upsertSettings(orgId, { encryptedPiiDek: encryptedDek });
    }

    return plaintextDek;
  }

  private getApiKeyFromPool(): string {
    // TODO (apps/web parity): in the future we should implement fetching
    // the API key from a pool — same accepted-risk comment as the original.
    return process.env.OPENAI_API_KEY!;
  }

  private resolveOrgModel(dbValue: string | null | undefined): string {
    if (process.env.NEXT_PUBLIC_HIDE_MODEL_SELECTOR === '1') {
      return process.env.DEFAULT_MODEL ?? defaultOrganizationSettings.model;
    }
    return dbValue || defaultOrganizationSettings.model;
  }

  async getUsageLimits(orgId: string): Promise<UsageLimits> {
    const settings = await this.getSettings(orgId);
    return {
      monthlyTokenLimit:
        settings?.monthlyTokenLimit != null
          ? Number(settings.monthlyTokenLimit)
          : null,
      monthlyCostLimitCents: settings?.monthlyCostLimitCents ?? null,
      monthlyMessageLimit: settings?.monthlyMessageLimit ?? null,
      monthlyApiRequestLimit: settings?.monthlyApiRequestLimit ?? null,
      maxMembers: settings?.maxMembers ?? null,
    };
  }

  async getStorageLimits(orgId: string): Promise<StorageLimits> {
    const settings = await this.getSettings(orgId);
    return {
      storageLimitBytes: Number(
        settings?.storageLimitBytes ?? defaultStorageLimits.storageLimitBytes,
      ),
      projectStorageLimitBytes: Number(
        settings?.projectStorageLimitBytes ??
          defaultStorageLimits.projectStorageLimitBytes,
      ),
      singleFileLimitBytes: Number(
        settings?.singleFileLimitBytes ??
          defaultStorageLimits.singleFileLimitBytes,
      ),
    };
  }

  async getRagPipelineSettings(orgId: string): Promise<RagPipelineSettings> {
    const settings = await this.getSettings(orgId);
    return {
      multiQueryEnabled:
        settings?.multiQueryEnabled ??
        defaultRagPipelineSettings.multiQueryEnabled,
      docSummariesEnabled:
        settings?.docSummariesEnabled ??
        defaultRagPipelineSettings.docSummariesEnabled,
      contentModerationEnabled:
        settings?.contentModerationEnabled ??
        defaultRagPipelineSettings.contentModerationEnabled,
      rerankingEnabled:
        settings?.rerankingEnabled ??
        defaultRagPipelineSettings.rerankingEnabled,
    };
  }

  async getLiteLLMOrgApiKey(orgId: string): Promise<string | null> {
    const settings = await this.getSettings(orgId);
    if (!settings?.litellmApiKey) {
      return null;
    }
    return decryptApiKey(settings.litellmApiKey);
  }

  async getAllowedConnectors(orgId: string): Promise<string[]> {
    const settings = await this.getSettings(orgId);
    return settings?.allowedConnectors ?? [];
  }

  /**
   * App-level default allowlist, stored in the `Settings` key/value table
   * (not per-org `OrganizationSettings`) under a fixed key.
   */
  async getDefaultAllowedConnectors(): Promise<string[]> {
    const row = await this.prisma.client.settings.findUnique({
      where: { key: 'default_allowed_connectors' },
    });
    if (!row) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(row.value);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((item): item is string => typeof item === 'string');
    } catch {
      return [];
    }
  }

  async getAllSettings(orgId: string): Promise<RawOrganizationSettings> {
    const settings = await this.getSettings(orgId);

    if (!settings) {
      return {
        apiKey: this.getApiKeyFromPool(),
        anthropicApiKey: null,
        googleApiKey: null,
        bedrockCredentials: null,
        ollamaHost: null,
        openrouterApiKey: null,
        fireworksApiKey: null,
        azureOpenaiCredentials: null,
        model: this.resolveOrgModel(null),
        temperature: defaultOrganizationSettings.temperature,
        prompt: defaultOrganizationSettings.prompt,
        maxDocumentsToRetrieve:
          defaultOrganizationSettings.maxDocumentsToRetrieve,
        voiceId: 'JBFqnCBsd6RMkjVDRZzb',
      };
    }

    const apiKey = settings.openaiApiKey
      ? decryptApiKey(settings.openaiApiKey)
      : this.getApiKeyFromPool();

    const anthropicApiKey = settings.anthropicApiKey
      ? decryptApiKey(settings.anthropicApiKey)
      : null;
    const googleApiKey = settings.googleApiKey
      ? decryptApiKey(settings.googleApiKey)
      : null;
    const openrouterApiKey = settings.openrouterApiKey
      ? decryptApiKey(settings.openrouterApiKey)
      : null;
    const fireworksApiKey = settings.fireworksApiKey
      ? decryptApiKey(settings.fireworksApiKey)
      : null;

    let bedrockCredentials = null;
    if (settings.bedrockCredentials) {
      try {
        bedrockCredentials = JSON.parse(
          decryptApiKey(settings.bedrockCredentials),
        );
      } catch {
        bedrockCredentials = null;
      }
    }

    let azureOpenaiCredentials = null;
    if (settings.azureOpenaiCredentials) {
      try {
        azureOpenaiCredentials = JSON.parse(
          decryptApiKey(settings.azureOpenaiCredentials),
        );
      } catch {
        azureOpenaiCredentials = null;
      }
    }

    return {
      apiKey,
      anthropicApiKey,
      googleApiKey,
      bedrockCredentials,
      ollamaHost: settings.ollamaHost || null,
      openrouterApiKey,
      fireworksApiKey,
      azureOpenaiCredentials,
      model: this.resolveOrgModel(settings.model),
      temperature:
        settings.temperature ?? defaultOrganizationSettings.temperature,
      prompt: settings.prompt || defaultOrganizationSettings.prompt,
      maxDocumentsToRetrieve:
        settings.maxDocumentsToRetrieve ??
        defaultOrganizationSettings.maxDocumentsToRetrieve,
      voiceId: settings.voiceId || 'JBFqnCBsd6RMkjVDRZzb',
    };
  }
}
