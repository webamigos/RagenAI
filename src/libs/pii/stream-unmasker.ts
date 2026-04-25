const TOKEN_START = '<';

export class StreamUnmasker {
  private aliasMap: Record<string, string>;
  private buffer: string;

  constructor(aliasMap: Record<string, string>) {
    this.aliasMap = aliasMap;
    this.buffer = '';
  }

  process(chunk: string): string {
    if (Object.keys(this.aliasMap).length === 0) {
      return chunk;
    }

    const input = this.buffer + chunk;
    this.buffer = '';

    let output = '';
    let i = 0;

    while (i < input.length) {
      const tokenStart = input.indexOf(TOKEN_START, i);

      if (tokenStart === -1) {
        output += input.slice(i);
        break;
      }

      output += input.slice(i, tokenStart);

      const tokenEnd = input.indexOf('>', tokenStart);

      if (tokenEnd === -1) {
        this.buffer = input.slice(tokenStart);
        break;
      }

      const candidate = input.slice(tokenStart, tokenEnd + 1);

      if (candidate in this.aliasMap) {
        output += this.aliasMap[candidate];
      } else {
        output += candidate;
      }

      i = tokenEnd + 1;
    }

    return output;
  }

  flush(): string {
    const remaining = this.buffer;
    this.buffer = '';
    return remaining;
  }
}
