import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { useState, useMemo, memo } from 'react';

import { CopyButton, Text, ArrowPath, Dialog } from '@ragenai/common-ui';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from '@ragenai/common-ui/Table/Table';
import { truncateFileName } from '@/app/lib/utils/truncateFileName';
import { useProjectKeyGenerator } from '@/app/hooks/useProjectKeyGenerator';
import { statusToast } from '@/app/lib/utils/toast';

type PublicProjectSectionProps = {
  linkToPublicProject: string;
  publishedAt: string;
  projectId: number;
  onLinkRefreshed?: (newLink: string) => void;
};

export const PublicProjectSection = memo(
  ({
    linkToPublicProject,
    publishedAt,
    projectId,
    onLinkRefreshed,
  }: PublicProjectSectionProps) => {
    const t = useTranslations('projects');
    const [isRefreshModalOpen, setIsRefreshModalOpen] = useState(false);
    const [currentLink, setCurrentLink] = useState(linkToPublicProject);
    const [currentPublishedAt, setCurrentPublishedAt] = useState(publishedAt);
    const { generateKey, isGenerating: isRefreshing } =
      useProjectKeyGenerator(projectId);
    const { errorToast } = statusToast();

    const truncatedLink = useMemo(
      () => truncateFileName(currentLink, 30),
      [currentLink]
    );

    const handleRefreshClick = () => {
      setIsRefreshModalOpen(true);
    };

    const handleRefreshConfirm = async () => {
      try {
        const accessToken = await generateKey();

        if (accessToken) {
          const baseUrl = linkToPublicProject.substring(
            0,
            linkToPublicProject.lastIndexOf('/') + 1
          );
          const newFullLink = baseUrl + accessToken;

          setCurrentLink(newFullLink);
          setCurrentPublishedAt(new Date().toISOString());
          if (onLinkRefreshed) {
            onLinkRefreshed(accessToken);
          }
        }
      } catch (error) {
        errorToast({
          message: t('share-knowledge.refresh-error'),
        });
      } finally {
        setIsRefreshModalOpen(false);
      }
    };

    const formattedDate = useMemo(
      () => format(new Date(currentPublishedAt), 'dd.MM.yyyy'),
      [currentPublishedAt]
    );

    return (
      <div className="mb-4 overflow-x-auto">
        <Table dense striped>
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
                <Text fontSize="xs">{truncatedLink}</Text>
              </TableCell>
              <TableCell>
                <Text fontSize="xs">{formattedDate}</Text>
              </TableCell>
              <div className="flex w-full justify-between pl-4">
                <CopyButton
                  className="mt-2"
                  textToCopy={currentLink}
                  aria-label={t('share-knowledge.copy-link-aria-label')}
                />
                <ArrowPath
                  className={`h-4 w-4 mt-2 cursor-pointer ${
                    isRefreshing ? 'animate-spin text-gray-400' : ''
                  }`}
                  onClick={handleRefreshClick}
                  aria-label={t('share-knowledge.refresh-link-aria-label')}
                />
              </div>
            </TableRow>
          </TableBody>
        </Table>

        <Dialog
          open={isRefreshModalOpen}
          onClose={() => setIsRefreshModalOpen(false)}
          className="max-w-md"
        >
          <div className="p-6 space-y-4">
            <Text className="text-lg font-semibold">
              {t('share-knowledge.refresh-link-title')}
            </Text>
            <Text className="text-sm text-gray-600 dark:text-gray-400">
              {t('share-knowledge.refresh-link-confirmation')}
            </Text>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsRefreshModalOpen(false)}
                className="px-4 py-2 rounded text-sm text-gray-700 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleRefreshConfirm}
                disabled={isRefreshing}
                className="px-4 py-2 rounded text-sm text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRefreshing
                  ? t('share-knowledge.refreshing')
                  : t('share-knowledge.refresh')}
              </button>
            </div>
          </div>
        </Dialog>
      </div>
    );
  }
);

PublicProjectSection.displayName = 'PublicProjectSection';
