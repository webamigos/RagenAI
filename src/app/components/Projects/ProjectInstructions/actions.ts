'use server';

import { saveProjectInstructionCommand as saveProjectInstruction } from '@/features/projects/services/commands/save-project-instruction-command';
import { getProjectInstructionQuery as getProjectInstruction } from '@/features/projects/services/queries/get-project-instruction-query';
import { logger } from '@/app/lib/utils/logger';
const serviceName = 'projectInstructions';

export async function saveProjectInstructionAction(
  projectId: string,
  instruction: string
): Promise<{ success: boolean; message: string }> {
  try {
    await saveProjectInstruction(projectId, instruction);
    return { success: true, message: 'Instruction saved successfully' };
  } catch (error) {
    logger.error({ err: error }, 'Failed to save project instruction');
    return { success: false, message: 'Failed to save project instruction' };
  }
}

export async function getProjectInstructionAction(
  projectId: string
): Promise<{ success: boolean; instruction: string | null; message?: string }> {
  try {
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
