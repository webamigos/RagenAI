import type React from 'react';
import {
  PdfIcon,
  EpubIcon,
  MarkdownIcon,
  CsvIcon,
  SrtIcon,
  WebsiteIcon,
  UnknownFileIcon,
  ImageIcon,
} from '@ragenai/common-ui/icons';
import { type FileType } from '@/generated/prisma/browser';

export const FILE_ICONS: Record<FileType, React.JSX.Element> = {
  PDF: <PdfIcon />,
  EPUB: <EpubIcon />,
  CSV: <CsvIcon />,
  XLSX: <CsvIcon />,
  DOCX: <MarkdownIcon />,
  TEXT: <MarkdownIcon />,
  MARKDOWN: <MarkdownIcon />,
  SRT: <SrtIcon />,
  URL: <WebsiteIcon />,
  IMAGE: <ImageIcon />,
  PPTX: <MarkdownIcon />,
  UNKNOWN: <UnknownFileIcon />,
};

export const getFileIcon = (fileType: FileType): React.JSX.Element => {
  return FILE_ICONS[fileType];
};
