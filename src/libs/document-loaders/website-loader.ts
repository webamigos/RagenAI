import FirecrawlApp from '@mendable/firecrawl-js';
import { randomUUID } from 'node:crypto';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { createMarkdownDocument } from '@/app/lib/services/document';
import { createFileDetailsInDB } from '@/app/lib/services/file';
import type { VectorStoreDocument } from '@/libs/vector-store/types';
import { WebsiteLoaderMode } from '@/features/documents/contracts/document.types';
import { FileType } from '@/generated/prisma/client';
import { sanitizeIngestedText } from '@/libs/ingest/sanitize';
import { recordSecurityEvent } from '@/features/security/services/commands/record-security-event-command';

export interface WebsiteDocumentLoaderParams {
  url: string;
  mode: WebsiteLoaderMode;
  fileName: string;
  organizationId: string;
  projectId: string;
  userId?: string | null;
}

export class WebsiteDocumentLoader {
  private readonly url: string;
  private readonly mode: WebsiteLoaderMode;
  private readonly fileName: string;
  private readonly organizationId: string;
  private readonly projectId: string;
  private readonly userId: string | null;

  constructor({
    url,
    mode,
    fileName,
    organizationId,
    projectId,
    userId,
  }: WebsiteDocumentLoaderParams) {
    this.url = url;
    this.fileName = fileName;
    this.mode = mode;
    this.organizationId = organizationId;
    this.projectId = projectId;
    this.userId = userId ?? null;
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

      // Phase 4 — sanitize the scraped markdown before persisting it.
      // Firecrawl is an untrusted source (the attacker controls the
      // page content). The sanitizer strips zero-width chars, HTML
      // comments, control chars, normalizes Unicode, and flags
      // suspicious prompt-injection patterns. The LLM never sees the
      // raw scraped text; it sees the sanitized form.
      const sanitizeResult = sanitizeIngestedText(combinedMarkdown);

      const enhancedMarkdown = `URL: ${this.url}\nMode: ${
        this.mode
      }\nProcessed at: ${new Date().toISOString()}\n\n${sanitizeResult.sanitized}`;

      const fileRecord = await createFileDetailsInDB(
        `${this.url} | ${this.mode}`,
        enhancedMarkdown.length,
        this.organizationId,
        FileType.URL,
        this.projectId,
      );

      if (sanitizeResult.suspicious) {
        // Flag the file so admins see a warning badge in the KB UI.
        // Best-effort — a failed metadata update must not abort the
        // ingest. Update and audit event are both fire-and-forget.
        db.userFile
          .update({
            where: { id: fileRecord.id },
            data: {
              metadata: {
                suspicious: true,
                sanitizerPatterns: sanitizeResult.patterns,
                flaggedAt: new Date().toISOString(),
                source: 'url-ingest',
              },
            },
          })
          .catch((err) => {
            logger.error(
              { err, fileId: fileRecord.id },
              'Failed to flag suspicious UserFile metadata (ingest continues)',
            );
          });

        recordSecurityEvent({
          eventType: 'UPLOAD_SUSPICIOUS_CONTENT',
          severity: 'info',
          source: 'upload',
          organizationId: this.organizationId,
          userId: this.userId,
          metadata: {
            fileId: fileRecord.id,
            fileName: `${this.url} | ${this.mode}`,
            fileType: 'URL',
            sourceUrl: this.url,
            patterns: sanitizeResult.patterns,
          },
        });

        logger.warn(
          {
            fileId: fileRecord.id,
            sourceUrl: this.url,
            patterns: sanitizeResult.patterns,
          },
          'URL ingest flagged as suspicious by ingest sanitizer',
        );
      }

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
