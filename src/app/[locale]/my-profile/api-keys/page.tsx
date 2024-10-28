import { Suspense } from 'react';
import Link from 'next/link';
import { unstable_setRequestLocale as setRequestLocale } from 'next-intl/server';
import { getTranslations } from 'next-intl/server';
import { format } from 'date-fns';

import { Card } from '@salesyy/common-ui/Card';
import * as CommonUi from '@salesyy/common-ui';

import { PropsWihLocale } from '@/app/lib/types/types';
import { ApiKeysSynchronizer } from '@/app/components/ApiKeys/ApiKeysSynchronizer/ApiKeysSynchronizer';
import { Fallback } from '@/app/components/Fallback';
import { fetchApiKeys } from '@/app/components/ApiKeys/actions';
import { RemoveApiKeyDialog } from '@/app/components/ApiKeys/RemoveApiKey/RemoveApiKeyDialog';

export async function generateMetadata({ params: { locale } }: PropsWihLocale) {
  const t = await getTranslations({ locale, namespace: 'api-keys' });

  return {
    title: t('title'),
  };
}

export default async function ApiKeysPage({
  params: { locale },
}: PropsWihLocale) {
  setRequestLocale(locale);
  const t = await getTranslations('api-keys');
  const result = await fetchApiKeys();

  if (!result.success) {
    return 'Fail to load keys';
  }

  return (
    <Card title={t('title')} size="full" className="mb-5">
      <Suspense fallback={<Fallback />}>
        <ApiKeysSynchronizer>
          <div className="flex w-full flex-col">
            <div className="flex justify-end">
              <Link href="/my-profile/api-keys/create">{t('create-key')}</Link>
            </div>
            <div className="mt-4">
              <CommonUi.Table>
                <CommonUi.TableHead>
                  <CommonUi.TableRow className="text-base">
                    <CommonUi.TableHeader>{t('name')}</CommonUi.TableHeader>
                    <CommonUi.TableHeader>
                      {t('secret-key')}
                    </CommonUi.TableHeader>
                    <CommonUi.TableHeader>{t('created')}</CommonUi.TableHeader>
                    {/* <CommonUi.TableHeader>
                      {t('created-by')}
                    </CommonUi.TableHeader> */}
                    <CommonUi.TableHeader>
                      <span className="sr-only">Actions</span>
                    </CommonUi.TableHeader>
                  </CommonUi.TableRow>
                </CommonUi.TableHead>
                <CommonUi.TableBody>
                  {result.payload?.map((apiKey) => (
                    <CommonUi.TableRow
                      className="text-sm"
                      key={apiKey.public_id}
                    >
                      <CommonUi.TableCell>{apiKey.name}</CommonUi.TableCell>
                      <CommonUi.TableCell>
                        {apiKey.masked_value}
                      </CommonUi.TableCell>
                      <CommonUi.TableCell>
                        {format(apiKey.created_at, 'dd.mm.yyyy HH:mm:ss')}
                      </CommonUi.TableCell>
                      {/* <CommonUi.TableCell>
                        {apiKey.created_by}
                      </CommonUi.TableCell> */}
                      <CommonUi.TableCell>
                        <div className="-mx-3 -my-1.5 sm:-mx-2.5">
                          <CommonUi.Tooltip
                            id="delete doc"
                            place="top"
                            content={'delete'}
                          >
                            <CommonUi.TrashIcon className="cursor-pointer" />
                          </CommonUi.Tooltip>

                          <RemoveApiKeyDialog keyId={apiKey.id} />
                        </div>
                      </CommonUi.TableCell>
                    </CommonUi.TableRow>
                  ))}
                </CommonUi.TableBody>
              </CommonUi.Table>
            </div>
          </div>
        </ApiKeysSynchronizer>
      </Suspense>
    </Card>
  );
}
