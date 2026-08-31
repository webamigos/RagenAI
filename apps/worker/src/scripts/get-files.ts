import { db } from '../services/db';
import { logger } from '../services/logger';

const fetchUserFile = async () => {
  return await db.getUserFile('1');
};

const run = async () => {
  const userFile = await fetchUserFile();
  logger.info(
    { fileId: userFile?.id, fileType: userFile?.file_type },
    'Fetched user file',
  );
  process.exit(0);
};

run();
