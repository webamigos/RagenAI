'use server';

import {
  saveProjectInstruction,
  getProjectInstruction,
} from '@/app/lib/services/projectInstructions';
import { logger } from '@/app/lib/utils/logger';
import {
  setSentryContext,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';

const serviceName = 'projectInstructions';

export async function saveProjectInstructionAction(
  projectId: string,
  instruction: string
): Promise<{ success: boolean; message: string }> {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('EXTRA_DATA', {
      projectId,
      instructionLength: instruction.length,
    });

    const result = await saveProjectInstruction(projectId, instruction);

    if (result.success) {
      return { success: true, message: 'Instruction saved successfully' };
    } else {
      return { success: false, message: result.status };
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to save project instruction');
    return { success: false, message: 'Failed to save project instruction' };
  }
}

export async function getProjectInstructionAction(
  projectId: string
): Promise<{ success: boolean; instruction: string | null; message?: string }> {
  try {
    setSentryServiceTag(serviceName);
    setSentryContext('EXTRA_DATA', {
      projectId,
    });

    const instruction = await getProjectInstruction(projectId);
    return { success: true, instruction };
  } catch (error) {
    logger.error({ err: error }, 'Failed to get project instruction');
    return {
      success: false,
      instruction: null,
      message: 'Failed to fetch project instruction',
    };
  }
}
