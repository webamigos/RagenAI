import { PdfIcon } from '@ragenai/common-ui/icons/PdfIcon';
import { EpubIcon } from '@ragenai/common-ui/icons/EpubIcon';
import { CsvIcon } from '@ragenai/common-ui/icons/CsvIcon';
import { MarkdownIcon } from '@ragenai/common-ui/icons/MarkdownIcon';

export const FILE_ICONS: Record<string, JSX.Element> = {
  pdf: <PdfIcon />,
  'epub+zip': <EpubIcon />,
  csv: <CsvIcon />,
  text: <MarkdownIcon />,
};

export const getFileIcon = (fileType: string): JSX.Element => {
  return FILE_ICONS[fileType.toLowerCase()];
};
