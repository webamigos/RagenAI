// import '@mendable/firecrawl-js';
// import { FireCrawlLoader } from '@langchain/community/document_loaders/web/firecrawl';
// import { logger } from '@/app/lib/utils/logger';
// import { createMarkdownDocument } from '@/app/lib/services/document';
// import { createFileDetailsInDB } from '@/app/lib/services/file';

// import { type Document } from '@langchain/core/documents';
// import { type TextSplitter } from 'langchain/text_splitter';
// import { type DocumentLoader } from '@langchain/core/document_loaders/base';
// import { WebsiteLoaderMode } from '@/app/contracts/DocumentLoading';

// export interface WebsiteDocumentLoaderParams {
//   url: string;
//   mode: WebsiteLoaderMode;
//   fileName: string;
//   fileId: string;
//   organizationId: string;
// }

// export class WebsiteDocumentLoader implements DocumentLoader {
//   private url: string;
//   private mode: WebsiteLoaderMode;
//   private fileName: string;
//   private fileId: string;
//   private organizationId: string;

//   constructor({
//     url,
//     mode,
//     fileName,
//     fileId,
//     organizationId,
//   }: WebsiteDocumentLoaderParams) {
//     this.url = url;
//     this.fileName = fileName;
//     this.mode = mode;
//     this.fileId = fileId;
//     this.organizationId = organizationId;
//   }

//   async load(): Promise<Document[]> {
//     try {
//       const commonOptions = {
//         formats: ['markdown'],
//         onlyMainContent: true,
//         excludeTags: ['img'],
//       };

//       const loader = new FireCrawlLoader({
//         url: this.url,
//         apiKey: process.env.FIRECRAWL_API_KEY,
//         mode: this.mode,
//         params:
//           this.mode === WebsiteLoaderMode.CRAWL
//             ? { scrapeOptions: commonOptions }
//             : commonOptions,
//       });

//       const docs = await loader.load();
//       const combinedMarkdown = docs.map((doc) => doc.pageContent).join('\n\n');

//       const enhancedMarkdown = `URL: ${this.url}\nMode: ${
//         this.mode
//       }\nProcessed at: ${new Date().toISOString()}\n\n${combinedMarkdown}`;

//       const fileRecord = await createFileDetailsInDB(
//         `${this.url} | ${this.mode}`,
//         enhancedMarkdown.length,
//         this.organizationId,
//         this.fileId,
//         'url'
//       );

//       await createMarkdownDocument({
//         public_id: this.fileId,
//         title: `${this.url} | ${this.mode}`,
//         organization_id: this.organizationId,
//         content: enhancedMarkdown,
//         file_id: fileRecord.id,
//       });

//       logger.info(
//         `Website content stored as markdown document for URL: ${this.url}, file: ${this.fileName}`
//       );
//       return docs;
//     } catch (error) {
//       logger.error(`Error loading website content for URL: ${this.url}`, error);
//       throw error;
//     }
//   }

//   async loadAndSplit(splitter?: TextSplitter): Promise<Document[]> {
//     const docs = await this.load();
//     if (splitter) {
//       return splitter.splitDocuments(docs);
//     }
//     return docs;
//   }
// }
