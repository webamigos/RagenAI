/* eslint-disable no-var */
var mockExistsSync: jest.Mock;
var mockUnlink: jest.Mock;
var mockDownloadToLocalFile: jest.Mock;
var mockLoggerInfo: jest.Mock;
var mockLoggerWarn: jest.Mock;
/* eslint-enable no-var */

jest.mock('fs', () => {
  mockExistsSync = jest.fn();
  mockUnlink = jest.fn();
  return {
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    promises: { unlink: (...args: unknown[]) => mockUnlink(...args) },
  };
});

jest.mock('../aws', () => {
  mockDownloadToLocalFile = jest.fn();
  return { aws: { downloadToLocalFile: mockDownloadToLocalFile } };
});

jest.mock('../logger', () => {
  mockLoggerInfo = jest.fn();
  mockLoggerWarn = jest.fn();
  return {
    logger: {
      info: (...args: unknown[]) => mockLoggerInfo(...args),
      warn: (...args: unknown[]) => mockLoggerWarn(...args),
      error: jest.fn(),
      debug: jest.fn(),
    },
  };
});

import path from 'path';
import { TMP_DIR } from '../../utils/cleanup-tmp';
import {
  localPathFor,
  ensureLocalFile,
  removeLocalFile,
} from '../ensure-local-file';

describe('localPathFor', () => {
  it('keys the path on fileId and the extension derived from fileName', () => {
    const result = localPathFor({
      orgId: 'org-1',
      fileId: 'abc-123',
      fileName: 'report.pdf',
    });

    expect(result).toBe(path.join(TMP_DIR, 'abc-123.pdf'));
  });

  it('rejects a fileId containing a path traversal segment', () => {
    expect(() =>
      localPathFor({
        orgId: 'org-1',
        fileId: '../../etc/passwd',
        fileName: 'x.txt',
      }),
    ).toThrow('Invalid fileId');
  });
});

describe('ensureLocalFile', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockDownloadToLocalFile.mockReset();
    mockLoggerInfo.mockReset();
  });

  it('reuses the local file without downloading when it already exists', async () => {
    mockExistsSync.mockReturnValue(true);

    const localPath = await ensureLocalFile({
      orgId: 'org-1',
      fileId: 'abc-123',
      fileName: 'report.pdf',
    });

    expect(localPath).toBe(path.join(TMP_DIR, 'abc-123.pdf'));
    expect(mockDownloadToLocalFile).not.toHaveBeenCalled();
  });

  // This is the invariant the atomic-rename fix in packages/storage protects:
  // ensureLocalFile trusts existsSync as its only signal that a download is
  // complete, so a previous attempt must never leave a file at this path
  // unless the download fully succeeded.
  it('downloads from S3 when no local file exists yet, keyed by fileId + extension', async () => {
    mockExistsSync.mockReturnValue(false);
    mockDownloadToLocalFile.mockResolvedValue(undefined);

    const localPath = await ensureLocalFile({
      orgId: 'org-1',
      fileId: 'abc-123',
      fileName: 'report.pdf',
    });

    expect(mockDownloadToLocalFile).toHaveBeenCalledWith(
      'org-1',
      'abc-123.pdf',
      path.join(TMP_DIR, 'abc-123.pdf'),
    );
    expect(localPath).toBe(path.join(TMP_DIR, 'abc-123.pdf'));
  });

  it('propagates a download failure rather than returning a partial path', async () => {
    mockExistsSync.mockReturnValue(false);
    mockDownloadToLocalFile.mockRejectedValue(new Error('connection reset'));

    await expect(
      ensureLocalFile({
        orgId: 'org-1',
        fileId: 'abc-123',
        fileName: 'report.pdf',
      }),
    ).rejects.toThrow('connection reset');
  });
});

describe('removeLocalFile', () => {
  beforeEach(() => {
    mockUnlink.mockReset();
    mockLoggerWarn.mockReset();
  });

  it('is a no-op when the file is already gone', async () => {
    mockUnlink.mockRejectedValue(
      Object.assign(new Error('gone'), { code: 'ENOENT' }),
    );

    await expect(
      removeLocalFile({
        orgId: 'org-1',
        fileId: 'abc-123',
        fileName: 'report.pdf',
      }),
    ).resolves.toBeUndefined();
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it('logs a warning, but does not throw, for a non-ENOENT unlink failure', async () => {
    mockUnlink.mockRejectedValue(
      Object.assign(new Error('permission denied'), { code: 'EACCES' }),
    );

    await expect(
      removeLocalFile({
        orgId: 'org-1',
        fileId: 'abc-123',
        fileName: 'report.pdf',
      }),
    ).resolves.toBeUndefined();
    expect(mockLoggerWarn).toHaveBeenCalled();
  });
});
