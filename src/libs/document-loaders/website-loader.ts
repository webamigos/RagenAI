import FirecrawlApp from '@mendable/firecrawl-js';
import { randomUUID } from 'node:crypto';
import { logger } from '@/app/lib/utils/logger';
import { createMarkdownDocument } from '@/app/lib/services/document';
import { createFileDetailsInDB } from '@/app/lib/services/file';
import type { VectorStoreDocument } from '@/libs/vector-store/types';
import { WebsiteLoaderMode } from '@/features/documents/contracts/document.types';
import { FileType } from '@/generated/prisma/client';

export interface WebsiteDocumentLoaderParams {
  url: string;
  mode: WebsiteLoaderMode;
  fileName: string;
  organizationId: string;
  projectId: string;
}

export class WebsiteDocumentLoader {
  private readonly url: string;
  private readonly mode: WebsiteLoaderMode;
  private readonly fileName: string;
  private readonly organizationId: string;
  private readonly projectId: string;

  constructor({
    url,
    mode,
    fileName,
    organizationId,
    projectId,
  }: WebsiteDocumentLoaderParams) {
    this.url = url;
    this.fileName = fileName;
    this.mode = mode;
    this.organizationId = organizationId;
    this.projectId = projectId;
  }

  async load(): Promise<VectorStoreDocument[]> {
    try {
      const firecrawl = new FirecrawlApp({
        apiKey: process.env.FIRECRAWL_API_KEY,
      });

      const commonOptions = {
        formats: ['markdown' as const],
        onlyMainContent: true,
        excludeTags: ['img'],
      };

      let docs: VectorStoreDocument[] = [];

      if (this.mode === WebsiteLoaderMode.CRAWL) {
        const crawlResult = await firecrawl.crawlUrl(this.url, {
          scrapeOptions: commonOptions,
        });

        if ('data' in crawlResult && crawlResult.data) {
          docs = crawlResult.data.map((doc: any) => ({
            pageContent: doc.markdown || '',
            metadata: {
              sourceURL: doc.metadata?.sourceURL || this.url,
              title: doc.metadata?.title,
            },
          }));
        }
      } else {
        const scrapeResult = await firecrawl.scrapeUrl(this.url, commonOptions);

        if ('markdown' in scrapeResult && scrapeResult.markdown) {
          docs = [
            {
              pageContent: scrapeResult.markdown,
              metadata: {
                sourceURL: scrapeResult.metadata?.sourceURL || this.url,
                title: scrapeResult.metadata?.title,
              },
            },
          ];
        }
      }

      const combinedMarkdown = docs.map((doc) => doc.pageContent).join('\n\n');

      const enhancedMarkdown = `URL: ${this.url}\nMode: ${
        this.mode
      }\nProcessed at: ${new Date().toISOString()}\n\n${combinedMarkdown}`;

      const fileRecord = await createFileDetailsInDB(
        `${this.url} | ${this.mode}`,
        enhancedMarkdown.length,
        this.organizationId,
        FileType.URL,
        this.projectId,
      );

      await createMarkdownDocument({
        id: randomUUID(),
        title: `${this.url} | ${this.mode}`,
        organizationId: this.organizationId,
        content: enhancedMarkdown,
        fileId: fileRecord.id,
      });

      logger.info(
        `Website content stored as markdown document for URL: ${this.url}, file: ${this.fileName}`,
      );
      return docs;
    } catch (error) {
      logger.error(`Error loading website content for URL: ${this.url}`, error);
      throw error;
    }
  }
}
