// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isBinary } = require('istextorbinary');
import {
  ensureLocalFile,
  type FileLocator,
} from '../../services/ensure-local-file';

export const checkIsBinaryFile = async (
  locator: FileLocator,
): Promise<boolean> => {
  const filePath = await ensureLocalFile(locator);
  return isBinary(filePath) ?? false;
};
