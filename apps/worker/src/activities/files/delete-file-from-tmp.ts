import {
  removeLocalFile,
  type FileLocator,
} from '../../services/ensure-local-file';

/**
 * Removes the deterministic local scratch file for a workflow's source file.
 * Best-effort: missing file is not an error.
 */
export async function deleteFileFromTmp(locator: FileLocator): Promise<void> {
  await removeLocalFile(locator);
}
