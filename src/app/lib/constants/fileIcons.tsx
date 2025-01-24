import {
  PdfIcon,
  EpubIcon,
  CsvIcon,
  MarkdownIcon,
  SrtIcon,
  UnknownFileIcon,
} from '@ragenai/common-ui/icons';
import { SupportedFileType } from '../services/file';

export const FILE_ICONS: Record<SupportedFileType, JSX.Element> = {
  pdf: <PdfIcon />,
  epub: <EpubIcon />,
  csv: <CsvIcon />,
  text: <MarkdownIcon />,
  markdown: <MarkdownIcon />,
  srt: <SrtIcon />,
  unknown: <UnknownFileIcon />,
};

export const getFileIcon = (fileType: SupportedFileType): JSX.Element => {
  return FILE_ICONS[fileType];
};
