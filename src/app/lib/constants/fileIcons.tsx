import { PdfIcon } from '@ragenai/common-ui/icons/PdfIcon';
import { EpubIcon } from '@ragenai/common-ui/icons/EpubIcon';
import { CsvIcon } from '@ragenai/common-ui/icons/CsvIcon';
import { TxtIcon } from '@ragenai/common-ui/icons/TxtIcon';

export const FILE_ICONS: Record<string, JSX.Element> = {
  pdf: <PdfIcon />,
  'epub+zip': <EpubIcon />,
  csv: <CsvIcon />,
  text: <TxtIcon />,
};

export const getFileIcon = (fileType: string): JSX.Element => {
  return FILE_ICONS[fileType.toLowerCase()];
};
