/* eslint-disable no-var */
var mockLoad: Mock;
/* eslint-enable no-var */

vi.mock('../../../services/document-loaders/website-loader.js', () => {
  mockLoad = vi.fn();
  return {
    WebsiteDocumentLoader: vi.fn(function () {
      return { load: mockLoad };
    }),
  };
});

vi.mock('../../../services/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import type { Mock } from 'vitest';
import { loadWebsite } from '../load-website.js';
import { WebsiteLoaderMode } from '../../../types/WebsiteLoaderMode.js';

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
