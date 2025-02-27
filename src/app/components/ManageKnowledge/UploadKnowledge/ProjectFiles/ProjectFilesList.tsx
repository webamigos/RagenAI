'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useOrganization } from '@clerk/nextjs';

import { Card, Text, TrashIcon } from '@ragenai/common-ui';

import { statusToast } from '@/app/lib/utils/toast';
import { deleteProjectFileAction, getProjectFiles } from '@/app/actions';
import { getFileIcon } from '@/app/lib/constants/fileIcons';
import { SupportedFileType } from '@/app/lib/services/fileParser';

type Props = {
  projectId: number;
};

type ProjectFile = {
  id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  created_at: Date | null;
  updated_at?: Date | null;
  metadata?: any;
  organization_id: string;
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const ProjectFilesList = ({ projectId }: Props) => {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);

  const t = useTranslations('projects');
  const { organization } = useOrganization();
  const router = useRouter();
  const { successToast, errorToast } = statusToast();

  const loadFiles = async () => {
    if (!organization) return;

    try {
      setLoading(true);
      const result = await getProjectFiles(projectId);

      if (result.error) {
        throw new Error(result.error);
      }

      setFiles(result.files || []);
    } catch (error) {
      setError(
        t('error.loading-files') || 'Nie udało się załadować plików projektu'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [projectId, organization]);

  const handleDeleteFile = async (fileId: string) => {
    if (!organization || deletingFileId) return;

    try {
      setDeletingFileId(fileId);
      const result = await deleteProjectFileAction(fileId, projectId);

      if (result.error) {
        throw new Error(result.error);
      }

      successToast({ message: t('file-deleted') || 'Plik został usunięty' });
      loadFiles();
      router.refresh();
    } catch (error) {
      errorToast({
        message: t('error.file-delete') || 'Nie udało się usunąć pliku',
      });
    } finally {
      setDeletingFileId(null);
    }
  };

  if (!organization) {
    return null;
  }

  if (loading) {
    return (
      <Card className="w-full p-6 flex justify-center items-center">
        <div className="w-6 h-6 border-t-2 border-blue-500 rounded-full animate-spin"></div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full p-6">
        <Text className="text-red-500">{error}</Text>
      </Card>
    );
  }

  if (files.length === 0) {
    return (
      <Card className="w-full p-6 flex justify-center items-center">
        <Text className="text-gray-500 dark:text-gray-400">
          {t('no-files')}
        </Text>
      </Card>
    );
  }

  return (
    <Card className="w-full p-4">
      <div className="mb-4">
        <Text className="text-lg font-medium">{t('project-files')}</Text>
      </div>
      <div className="space-y-2">
        {files.map((file) => (
          <div
            key={file.id}
            className="p-3 rounded-md border border-gray-200 dark:border-gray-700 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="h-8 w-8 text-gray-400 flex items-center justify-center">
              {getFileIcon(file.file_type as SupportedFileType)}
            </div>
            <div className="flex-1 min-w-0">
              <Text className="font-medium truncate">{file.file_name}</Text>
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span>{formatFileSize(file.file_size)}</span>
                <span>•</span>
                <span>
                  {file.created_at
                    ? new Date(file.created_at).toLocaleDateString()
                    : '-'}
                </span>
              </div>
            </div>
            <span className="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
              {file.file_type}
            </span>
            <button
              onClick={() => handleDeleteFile(file.id)}
              disabled={deletingFileId === file.id}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
              title={t('remove-file') || 'Usuń plik'}
            >
              {deletingFileId === file.id ? (
                <div className="w-4 h-4 border-t-2 border-red-500 rounded-full animate-spin"></div>
              ) : (
                <TrashIcon className="w-4 h-4" />
              )}
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
};
