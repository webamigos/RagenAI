import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState } from 'react';
import { ComponentProps } from 'react';
import prettyBytes from 'pretty-bytes';
import format from 'date-fns-tz/format';
import { useTranslations } from 'next-intl';

import * as CommonUi from '@salesyy/common-ui';
import { deleteDocument } from '@/app/actions';
import { type UserFileType } from '@/app/contracts/Documents';
import { classMerge } from '@salesyy/common-ui';
import { statusToast } from '@/app/lib/utils/toast';
import { truncateFileName } from '../../../lib/utils/truncateFileName';
import { fetchDocumentByOrganization } from '../../MarkdownDocumentsCreator/action';
import { P } from 'pino';

type Props = {
  documents: UserFileType[];
  onAddDocument: (newDocument: UserFileType) => void;
  onRemoveDocument: (documentId: string) => void;
};

type DocumentRowProps = {
  document: UserFileType;
  onRemoveDocument: (documentId: string) => void;
};

const DocumentRow = ({ document, onRemoveDocument }: DocumentRowProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewsDocument, setPreviewsDocument] = useState<
    string[] | undefined
  >();

  const { created_at, updated_at, file_name, file_size, id, organization_id } =
    document;

  const successTranslatedMessage = useTranslations('success-toast');
  const errorTranslatedMessage = useTranslations('error-toast');
  const { errorToast, successToast } = statusToast();

  const formattedCreatedAt = created_at
    ? format(new Date(created_at), 'dd.MM.yyyy HH:mm:ss')
    : '-';
  const formattedUpdatedAt = updated_at
    ? format(new Date(updated_at), 'dd.MM.yyyy HH:mm:ss')
    : '-';
  const truncatedFileName = truncateFileName(file_name, 20);

  const handleDelete = async () => {
    setIsLoading(true);

    try {
      const { status } = await deleteDocument(organization_id, id);
      if (status === 200) {
        onRemoveDocument(id);
        successToast({
          message: `${successTranslatedMessage('deleted')} ${file_name}`,
        });
      }
    } catch (error) {
      errorToast({
        message: `${errorTranslatedMessage('error-during-deleting-file')}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreviewModal = async (orgId: string, title: string) => {
    setIsLoadingPreview(true);
    const documentContent = await handleGetPreview(orgId, title);
    if (documentContent) {
      setPreviewsDocument(documentContent);
      setIsPreview(true);
    }
    setIsLoadingPreview(false);
  };

  const handleGetPreview = async (
    orgId: string,
    title: string
  ): Promise<string[] | undefined> => {
    const response = await fetchDocumentByOrganization(orgId, title);

    if (response.success) {
      return response.documents.map((doc) => doc.content);
    }

    if (!response.success) {
      errorToast({ message: `${(response.error, response.message)}` });
    }
  };

  return (
    <>
      <CommonUi.TableRow className="text-sm overflow-x-hidden">
        <CommonUi.TableCell title={file_name}>
          {truncatedFileName}
        </CommonUi.TableCell>
        <CommonUi.TableCell>{prettyBytes(file_size)}</CommonUi.TableCell>
        <CommonUi.TableCell>{formattedCreatedAt}</CommonUi.TableCell>
        <CommonUi.TableCell>{formattedUpdatedAt}</CommonUi.TableCell>
        <CommonUi.TableCell>
          <div className="-mx-3 mr-10 -my-1.5 sm:-mx-2.5">
            {isLoadingPreview ? (
              <CommonUi.SpinnerSVG size="sm" className="ml-1" />
            ) : (
              <CommonUi.OpenEyeIcon
                onClick={() =>
                  handlePreviewModal(document.organization_id, document.id)
                }
                className="cursor-pointer"
              />
            )}
          </div>
        </CommonUi.TableCell>
        <CommonUi.TableCell>
          <div className="-mx-3 mr-10 -my-1.5 sm:-mx-2.5">
            {isLoading ? (
              <CommonUi.SpinnerSVG size="sm" className="ml-1" />
            ) : (
              <CommonUi.TrashIcon
                onClick={handleDelete}
                className="cursor-pointer"
              />
            )}
          </div>
        </CommonUi.TableCell>
      </CommonUi.TableRow>

      {isPreview && (
        <CommonUi.Dialog
          className="h-screen overflow-auto"
          open={isPreview}
          onClose={() => setIsPreview(false)}
        >
          <div className="p-4 prose">
            <h2 className="text-xl font-semibold mb-2">Document Preview</h2>
            {isLoadingPreview ? (
              <CommonUi.SpinnerSVG size="lg" />
            ) : (
              previewsDocument?.map((content, index) => (
                <ReactMarkdown key={index} remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
              ))
            )}
          </div>
        </CommonUi.Dialog>
      )}
    </>
  );
};

export const UserDocumentsTable = ({
  className,
  documents,
  onRemoveDocument,
}: Props & ComponentProps<'table'>) => {
  const t = useTranslations('files-table');
  return (
    <CommonUi.Table className={classMerge(className)}>
      <CommonUi.TableHead>
        <CommonUi.TableRow className="text-base">
          <CommonUi.TableHeader>{t('file-name')}</CommonUi.TableHeader>
          <CommonUi.TableHeader>{t('file-size')}</CommonUi.TableHeader>
          <CommonUi.TableHeader>{t('created')}</CommonUi.TableHeader>
          <CommonUi.TableHeader>{t('updated')}</CommonUi.TableHeader>
          <CommonUi.TableHeader>
            <span className="sr-only">Actions</span>
          </CommonUi.TableHeader>
        </CommonUi.TableRow>
      </CommonUi.TableHead>
      <CommonUi.TableBody>
        {documents.map((document) => (
          <DocumentRow
            key={document.id}
            document={document}
            onRemoveDocument={onRemoveDocument}
          />
        ))}
      </CommonUi.TableBody>
    </CommonUi.Table>
  );
};
