import { EPub } from 'epub2';
import { Document } from '../../types/Document';
import { logger } from '../../services/logger';
import {
  ensureLocalFile,
  type FileLocator,
} from '../../services/ensure-local-file';

export const loadEpub = async (locator: FileLocator): Promise<Document[]> => {
  try {
    const filePath = await ensureLocalFile(locator);
    const epub = await EPub.createAsync(filePath);

    const docs: Document[] = [];
    const flow = epub.flow || [];

    for (const chapter of flow) {
      if (!chapter.id) continue;
      try {
        const text = await epub.getChapterAsync(chapter.id);
        if (text) {
          // Strip HTML tags to get plain text
          const plainText = text
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (plainText) {
            docs.push({
              pageContent: plainText,
              metadata: {
                source: filePath,
                chapter: chapter.title || chapter.id,
              },
            });
          }
        }
      } catch (error) {
        logger.warn(
          { err: error, chapterId: chapter.id, filePath },
          'Skipping unreadable EPUB chapter',
        );
      }
    }

    return docs;
  } catch (error) {
    logger.error({ err: error, locator }, 'Failed to load EPUB');
    throw error;
  }
};
