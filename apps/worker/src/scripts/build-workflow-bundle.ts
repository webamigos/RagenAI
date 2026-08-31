import { bundleWorkflowCode } from '@temporalio/worker';
import { writeFile } from 'fs/promises';
import path from 'path';

import { logger } from '../services/logger';

async function bundle() {
  const { code } = await bundleWorkflowCode({
    workflowsPath: require.resolve('../workflows'),
  });
  const codePath = path.join(__dirname, '../../workflow-bundle.js');

  await writeFile(codePath, code);
  logger.info(`Bundle written to ${codePath}`);
}

bundle().catch((err) => {
  logger.error({ err }, 'Bundle failed');
  process.exit(1);
});
