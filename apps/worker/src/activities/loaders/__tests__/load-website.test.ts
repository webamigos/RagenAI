/* eslint-disable no-var */
var mockLoad: jest.Mock;
/* eslint-enable no-var */

jest.mock('../../../services/document-loaders/website-loader', () => {
  mockLoad = jest.fn();
  return {
    WebsiteDocumentLoader: jest.fn(function () {
      return { load: mockLoad };
    }),
  };
});

jest.mock('../../../services/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import { loadWebsite } from '../load-website';
import { WebsiteLoaderMode } from '../../../types/WebsiteLoaderMode';

describe('loadWebsite', () => {
  beforeEach(() => {
    mockLoad.mockReset();
  });

  // The one place this validation matters for real: scrapeWebsite's workflow
  // code already rejects an invalid mode before ever calling this activity,
  // but the activity is reachable under its own RetryPolicy (5 attempts, up
  // to 1 min backoff) if that guard is ever bypassed or the activity is
  // called from elsewhere — nonRetryable stops that from burning ~2 minutes
  // retrying a mode string that will never become valid.
  it('rejects an invalid mode as non-retryable, without constructing a loader', async () => {
    await expect(
      loadWebsite({
        url: 'https://example.com',
        mode: 'bogus' as WebsiteLoaderMode,
        orgId: 'org-1',
        projectId: 'proj-1',
      }),
    ).rejects.toMatchObject({
      nonRetryable: true,
      message: 'Invalid crawl mode',
    });

    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('delegates to the loader for a valid mode', async () => {
    mockLoad.mockResolvedValue([{ pageContent: 'hi', metadata: {} }]);

    const result = await loadWebsite({
      url: 'https://example.com',
      mode: WebsiteLoaderMode.SCRAPE,
      orgId: 'org-1',
      projectId: 'proj-1',
    });

    expect(result).toEqual([{ pageContent: 'hi', metadata: {} }]);
  });

  it('rethrows (retryable) a genuine loader failure', async () => {
    mockLoad.mockRejectedValue(new Error('FireCrawl timeout'));

    await expect(
      loadWebsite({
        url: 'https://example.com',
        mode: WebsiteLoaderMode.CRAWL,
        orgId: 'org-1',
        projectId: 'proj-1',
      }),
    ).rejects.toThrow('FireCrawl timeout');
  });
});
