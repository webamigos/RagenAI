import { type Document } from '../../types/Document.js';
import { splitDocuments } from './recursive-character-text-splitter.js';

const MARKDOWN_SEPARATORS = [
  '\n## ',
  '\n### ',
  '\n#### ',
  '\n##### ',
  '\n###### ',
  '\n\n',
  '\n',
  ' ',
  '',
];

type MarkdownSplitterOptions = {
  chunkSize: number;
  chunkOverlap: number;
  keepSeparator?: boolean;
};

export function splitMarkdownDocuments(
  docs: Document[],
  options: MarkdownSplitterOptions,
): Document[] {
  return splitDocuments(docs, {
    ...options,
    separators: MARKDOWN_SEPARATORS,
  });
}
