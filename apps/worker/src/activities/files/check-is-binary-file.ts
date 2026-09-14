import { isBinary } from 'istextorbinary';
import {
  ensureLocalFile,
  type FileLocator,
} from '../../services/ensure-local-file.js';

export const checkIsBinaryFile = async (
  locator: FileLocator,
): Promise<boolean> => {
  const filePath = await ensureLocalFile(locator);
  return isBinary(filePath) ?? false;
};
