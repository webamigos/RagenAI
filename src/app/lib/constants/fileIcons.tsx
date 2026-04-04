import {
  PdfIcon,
  EpubIcon,
  MarkdownIcon,
  SrtIcon,
  WebsiteIcon,
  UnknownFileIcon,
  ImageIcon,
} from '@ragenai/common-ui/icons';
import { type FileType } from '@/generated/prisma/browser';

export const FILE_ICONS: Record<FileType, JSX.Element> = {
  PDF: <PdfIcon />,
  EPUB: <EpubIcon />,
  // csv: <CsvIcon />,
  TEXT: <MarkdownIcon />,
  MARKDOWN: <MarkdownIcon />,
  SRT: <SrtIcon />,
  URL: <WebsiteIcon />,
  IMAGE: <ImageIcon />,
  UNKNOWN: <UnknownFileIcon />,
};

export const getFileIcon = (fileType: FileType): JSX.Element => {
  return FILE_ICONS[fileType];
};
