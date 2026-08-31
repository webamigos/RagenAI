import { Document } from '../../types/Document';

export class BufferLoader {
  private buffer: Buffer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private metadata: Record<string, any>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
