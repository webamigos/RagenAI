import { type Document } from '../../types/Document';

export class BufferLoader {
  private buffer: Buffer;
  private metadata: Record<string, any>;

  constructor(buffer: Buffer, metadata: Record<string, any> = {}) {
    this.buffer = buffer;
    this.metadata = metadata;
  }

  async load(): Promise<Document[]> {
    const textContent = this.buffer.toString('utf-8');
    return [
      {
        pageContent: textContent,
        metadata: this.metadata,
      },
    ];
  }
}
