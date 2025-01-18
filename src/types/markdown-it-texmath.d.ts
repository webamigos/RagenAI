declare module 'markdown-it-texmath' {
  import MarkdownIt from 'markdown-it';
  import { KatexOptions } from 'katex';

  interface TexmathOptions {
    engine: any;
    delimiters?: 'dollars' | 'brackets' | 'gitlab' | 'julia' | 'kramdown';
    katexOptions?: KatexOptions;
  }

  function texmath(md: MarkdownIt, options: TexmathOptions): void;
  export default texmath;
}
