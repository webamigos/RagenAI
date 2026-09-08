import FirecrawlApp from '@mendable/firecrawl-js';

import { type Document } from '../../types/Document';
import { type UserFile } from '../db';
import { logger } from '../logger';
import { WebsiteLoaderMode } from '../../types/WebsiteLoaderMode';

export interface WebsiteDocumentLoaderParams {
  url: string;
  mode: WebsiteLoaderMode;
  orgId: UserFile['organizationId'];
  projectId: UserFile['projectId'];
}

export class WebsiteDocumentLoader {
  private readonly url: string;
  private readonly mode: WebsiteLoaderMode;
  private readonly orgId: UserFile['organizationId'];
  private readonly projectId: UserFile['projectId'];

  constructor({ url, mode, orgId, projectId }: WebsiteDocumentLoaderParams) {
    this.url = url;
    this.mode = mode;
    this.orgId = orgId;
    this.projectId = projectId;
  }

  async load(): Promise<Document[]> {
    try {
      const app = new FirecrawlApp({
        apiKey: process.env.FIRECRAWL_API_KEY,
      });

      const commonOptions = {
        formats: ['markdown' as const],
        onlyMainContent: true,
        excludeTags: ['img'],
      };

      if (this.mode === WebsiteLoaderMode.CRAWL) {
        const result = await app.crawlUrl(this.url, {
          scrapeOptions: commonOptions,
        });

        if (!result.success) {
          throw new Error(`FireCrawl crawl failed: ${result.error}`);
        }

        const docs: Document[] = (result.data || []).map((page) => ({
          pageContent: page.markdown || '',
          metadata: {
            source: page.metadata?.sourceURL || this.url,
            title: page.metadata?.title || '',
          },
        }));

        logger.info(
          `Website content stored as markdown document for URL: ${this.url}`,
        );
        return docs;
      } else {
        const result = await app.scrapeUrl(this.url, commonOptions);

        if (!result.success) {
          throw new Error(`FireCrawl scrape failed: ${result.error}`);
        }

        const docs: Document[] = [
          {
            pageContent: result.markdown || '',
            metadata: {
              source: result.metadata?.sourceURL || this.url,
              title: result.metadata?.title || '',
            },
          },
        ];

        logger.info(
          `Website content stored as markdown document for URL: ${this.url}`,
        );
        return docs;
      }
    } catch (error) {
      logger.error(
        { err: error },
        `Error loading website content for URL: ${this.url}`,
      );
      throw error;
    }
  }
}
