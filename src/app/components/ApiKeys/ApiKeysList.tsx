'use client';

import { useState, useTransition } from 'react';
import { format } from 'date-fns';
import { ApiKey } from '@prisma/client';
import { useTranslations } from 'next-intl';
import { toast } from 'react-toastify';
import { useRouter } from '@/i18n/routing';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TrashIcon,
} from '@ragenai/common-ui';

import { RemoveApiKeyDialog } from './RemoveApiKey/RemoveApiKeyDialog';
import { removeApiKey } from './RemoveApiKey/actions';
import { Link } from '@/i18n/routing';

type Props = {
  data: ApiKey[];
};

export const ApiKeysList = ({ data }: Props) => {
  const t = useTranslations('api-keys');
  const [selectedKey, setSelectedKey] = useState<ApiKey['id'] | null>(null);
  const [isDialogOpened, setIsDialogOpened] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { refresh } = useRouter();

  const selectKey = (keyId: ApiKey['id']) => () => {
    setSelectedKey(keyId);
    setIsDialogOpened(true);
  };

  const handleDialogClose = () => {
    setIsDialogOpened(false);
  };

  const handleDialogCancel = () => {
    setIsDialogOpened(false);
  };

  const handleDialogConfirm = async () => {
    if (selectedKey) {
      const { success } = await removeApiKey(selectedKey);
      if (success) {
        startTransition(() => refresh());
        setIsDialogOpened(false);
        toast.success('Key was removed');
      } else {
        toast.error('Error during removing API Key');
      }
    }
  };

  return (
    <div className="flex w-full flex-col">
      <div className="flex justify-end">
        <Link
          href="/my-profile/api-keys/create"
          className="ring-1 ring-primary-dark rounded-md bg-blue-500 text-white px-2 py-2"
        >
          {t('create-key')}
        </Link>
      </div>
      <div className="mt-4">
        <Table>
          <TableHead>
            <TableRow className="text-base">
              <TableHeader>{t('name')}</TableHeader>
              <TableHeader>{t('secret-key')}</TableHeader>
              <TableHeader>{t('created')}</TableHeader>
              {/* <CommonUi.TableHeader>
                      {t('created-by')}
                    </CommonUi.TableHeader> */}
              <TableHeader>
                <span className="sr-only">Actions</span>
              </TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((apiKey) => (
              <TableRow className="text-sm" key={apiKey.public_id}>
                <TableCell>{apiKey.name}</TableCell>
                <TableCell>{apiKey.masked_value}</TableCell>
                <TableCell>
                  {format(apiKey.created_at, 'dd.mm.yyyy HH:mm:ss')}
                </TableCell>
                {/* <CommonUi.TableCell>
                        {apiKey.created_by}
                      </CommonUi.TableCell> */}
                <TableCell>
                  <div className="-mx-3 -my-1.5 sm:-mx-2.5">
                    <Tooltip id="delete doc" place="top" content={'delete'}>
                      <TrashIcon
                        className="cursor-pointer"
                        onClick={selectKey(apiKey.id)}
                      />
                    </Tooltip>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <RemoveApiKeyDialog
        isOpen={isDialogOpened}
        isPending={isPending}
        onClose={handleDialogClose}
        onCancel={handleDialogCancel}
        onConfirm={handleDialogConfirm}
      />
    </div>
  );
};
