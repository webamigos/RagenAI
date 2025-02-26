import {
  PdfIcon,
  EpubIcon,
  CsvIcon,
  MarkdownIcon,
  SrtIcon,
  UnknownFileIcon,
} from '@ragenai/common-ui/icons';
import { type SupportedFileType } from '@/app/lib/services/fileParser';

export const FILE_ICONS: Record<SupportedFileType, JSX.Element> = {
  pdf: <PdfIcon />,
  epub: <EpubIcon />,
  // csv: <CsvIcon />,
  text: <MarkdownIcon />,
  // markdown: <MarkdownIcon />,
  srt: <SrtIcon />,
  url: <UnknownFileIcon />,
  // unknown: <UnknownFileIcon />,
};

export const getFileIcon = (fileType: SupportedFileType): JSX.Element => {
  return FILE_ICONS[fileType];
};
