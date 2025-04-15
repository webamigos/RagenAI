import {
  PdfIcon,
  EpubIcon,
  MarkdownIcon,
  SrtIcon,
  WebsiteIcon,
  UnknownFileIcon,
} from '@ragenai/common-ui/icons';
import { FileType } from '@prisma/client';

export const FILE_ICONS: Record<FileType, JSX.Element> = {
  PDF: <PdfIcon />,
  EPUB: <EpubIcon />,
  // csv: <CsvIcon />,
  TEXT: <MarkdownIcon />,
  MARKDOWN: <MarkdownIcon />,
  SRT: <SrtIcon />,
  URL: <WebsiteIcon />,
  UNKNOWN: <UnknownFileIcon />,
};

export const getFileIcon = (fileType: FileType): JSX.Element => {
  return FILE_ICONS[fileType];
};
