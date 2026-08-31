declare module '@hyzyla/pdfium' {
  export class PDFiumLibrary {
    static init(): Promise<PDFiumLibrary>;
    destroy(): void;
    loadDocument(
      buffer: Buffer,
      password?: string,
    ): Promise<import('@hyzyla/pdfium').PDFiumDocument>;
  }
}
