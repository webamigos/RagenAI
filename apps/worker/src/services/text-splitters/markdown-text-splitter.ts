import { Document } from '../../types/Document';
import { splitDocuments } from './recursive-character-text-splitter';

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
