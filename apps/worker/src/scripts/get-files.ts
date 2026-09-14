import { db } from '../services/db/index.js';
import { logger } from '../services/logger.js';

// Ad-hoc local debugging script — placeholders, not real ids.
const fetchUserFile = async () => {
  return await db.getUserFile('1', '1');
};

const run = async () => {
  const userFile = await fetchUserFile();
  logger.info(
    { fileId: userFile?.id, fileType: userFile?.fileType },
    'Fetched user file',
  );
  process.exit(0);
};

run();
