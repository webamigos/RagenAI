// @deprecated — Import from @/features/messages/ instead
'use server';

export { type DbMessageDto } from '@/features/messages/contracts/message.types';

export {
  createMessageInDbCommand as createMessageInDB,
  createAndStoreMessageCommand as createAndStoreMessage,
} from '@/features/messages/services/commands/create-message-command';

export { getThreadMessagesQuery as fetchMessagesFromDb } from '@/features/messages/services/queries/get-thread-messages-query';

export { getMessageByIdQuery as getMessageById } from '@/features/messages/services/queries/get-message-query';

export { updateMessagePlayedCommand as updateMessagePlayedStatus } from '@/features/messages/services/commands/update-message-played-command';

// Adapter: old signature throws on error, new returns OperationResult
import db from '@ragenai/prisma-client';
import { logger } from '../utils/logger';

/** @deprecated Use deleteMessageCommand from @/features/messages instead */
export const deleteMessageByPublicId = async (
  publicId: string
): Promise<void> => {
  try {
    await db.message.delete({
      where: { public_id: publicId },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete message by public ID');
    throw error;
  }
};

/** @deprecated Use rateMessageCommand from @/features/messages instead */
export const saveRateInDB = async (messagePublicId: string, rate: number) => {
  try {
    return await db.message.update({
      where: { public_id: messagePublicId },
      data: { rate },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to save rate in DB');
    throw error;
  }
};
