'use server';

import { requireAdmin } from '@/lib/auth-guard';
import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

const DEFAULT_RAG_SETTINGS_KEY = 'default_rag_pipeline_settings';

export type RagPipelineSettings = {
  multiQueryEnabled: boolean;
  docSummariesEnabled: boolean;
  contentModerationEnabled: boolean;
  rerankingEnabled: boolean;
};

const DEFAULT_VALUES: RagPipelineSettings = {
  multiQueryEnabled: true,
  docSummariesEnabled: true,
  contentModerationEnabled: true,
  rerankingEnabled: true,
};

export async function getDefaultRagSettingsAction(): Promise<RagPipelineSettings> {
  await requireAdmin();
  const row = await prisma.settings.findUnique({
    where: { key: DEFAULT_RAG_SETTINGS_KEY },
  });
  if (!row) {
    return { ...DEFAULT_VALUES };
  }
  try {
    const parsed = JSON.parse(row.value) as Partial<RagPipelineSettings>;
    return {
      multiQueryEnabled:
        parsed.multiQueryEnabled ?? DEFAULT_VALUES.multiQueryEnabled,
      docSummariesEnabled:
        parsed.docSummariesEnabled ?? DEFAULT_VALUES.docSummariesEnabled,
      contentModerationEnabled:
        parsed.contentModerationEnabled ??
        DEFAULT_VALUES.contentModerationEnabled,
      rerankingEnabled:
        parsed.rerankingEnabled ?? DEFAULT_VALUES.rerankingEnabled,
    };
  } catch {
    return { ...DEFAULT_VALUES };
  }
}

function validateRagSettings(input: unknown): RagPipelineSettings {
  if (
    typeof input !== 'object' ||
    input === null ||
    typeof (input as RagPipelineSettings).multiQueryEnabled !== 'boolean' ||
    typeof (input as RagPipelineSettings).docSummariesEnabled !== 'boolean' ||
    typeof (input as RagPipelineSettings).contentModerationEnabled !==
      'boolean' ||
    typeof (input as RagPipelineSettings).rerankingEnabled !== 'boolean'
  ) {
    throw new Error('Invalid RAG settings');
  }
  return {
    multiQueryEnabled: (input as RagPipelineSettings).multiQueryEnabled,
    docSummariesEnabled: (input as RagPipelineSettings).docSummariesEnabled,
    contentModerationEnabled: (input as RagPipelineSettings)
      .contentModerationEnabled,
    rerankingEnabled: (input as RagPipelineSettings).rerankingEnabled,
  };
}

export async function saveDefaultRagSettingsAction(
  settings: RagPipelineSettings,
): Promise<void> {
  const admin = await requireAdmin();
  const before = await getDefaultRagSettingsAction();
  const validated = validateRagSettings(settings);
  await prisma.settings.upsert({
    where: { key: DEFAULT_RAG_SETTINGS_KEY },
    update: { value: JSON.stringify(validated) },
    create: { key: DEFAULT_RAG_SETTINGS_KEY, value: JSON.stringify(validated) },
  });
  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.defaultRagSettingsChanged,
    entityType: 'settings',
    entityId: 'default_rag_pipeline_settings',
    before: before as unknown as Record<string, unknown>,
    after: validated as unknown as Record<string, unknown>,
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  revalidatePath('/rag-settings');
}

export async function saveOrgRagSettingsAction(
  orgId: string,
  settings: RagPipelineSettings,
): Promise<void> {
  const admin = await requireAdmin();
  if (!orgId?.trim()) {
    throw new Error('Invalid organization ID');
  }
  const validated = validateRagSettings(settings);

  await prisma.organizationSettings.upsert({
    where: { organizationId: orgId },
    update: {
      multiQueryEnabled: validated.multiQueryEnabled,
      docSummariesEnabled: validated.docSummariesEnabled,
      contentModerationEnabled: validated.contentModerationEnabled,
      rerankingEnabled: validated.rerankingEnabled,
    },
    create: {
      organizationId: orgId,
      multiQueryEnabled: validated.multiQueryEnabled,
      docSummariesEnabled: validated.docSummariesEnabled,
      contentModerationEnabled: validated.contentModerationEnabled,
      rerankingEnabled: validated.rerankingEnabled,
    },
  });

  // Turning moderation off is a safety-relevant change, so this one carries a
  // security event even though the other per-org setting writes do not.
  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.orgRagSettingsChanged,
    entityType: 'organization_settings',
    entityId: orgId,
    organizationId: orgId,
    after: validated as unknown as Record<string, unknown>,
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  revalidatePath('/rag-settings');
  revalidatePath(`/organizations/${orgId}`);
}
