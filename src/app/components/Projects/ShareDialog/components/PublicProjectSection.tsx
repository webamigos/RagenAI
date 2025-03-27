import { useTranslations } from 'next-intl';
import { format } from 'date-fns';

import { CopyButton, Text, ArrowPath } from '@ragenai/common-ui';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from '@ragenai/common-ui/Table/Table';
import { truncateFileName } from '@/app/lib/utils/truncateFileName';

type PublicProjectSectionProps = {
  linkToPublicProject: string;
  publishedAt: string;
  projectId: number;
};

export const PublicProjectSection = ({
  linkToPublicProject,
  publishedAt,
  projectId,
}: PublicProjectSectionProps) => {
  const t = useTranslations('projects');

  return (
    <div className="mb-4 overflow-x-auto">
      <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
        {t('share-knowledge.title')}
      </Text>

      <Table bleed dense striped>
        <TableHead>
          <TableRow>
            <TableHeader>
              <Text fontSize="xs" fontWeight="semibold">
                {t('share-knowledge.project-table.name').toUpperCase()}
              </Text>
            </TableHeader>
            <TableHeader>
              <Text fontSize="xs" fontWeight="semibold">
                {t('share-knowledge.project-table.publishedAt').toUpperCase()}
              </Text>
            </TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>
              <Text fontSize="xs">
                {truncateFileName(linkToPublicProject, 20)}
              </Text>
            </TableCell>
            <TableCell>
              <Text fontSize="xs">
                {format(new Date(publishedAt), 'dd.MM.yyyy')}
              </Text>
            </TableCell>
            <div className="flex">
              <CopyButton className="mt-2" textToCopy={linkToPublicProject} />
              <ArrowPath className="h-4 w-4 ml-1 mt-2 cursor-pointer" />
            </div>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
};
