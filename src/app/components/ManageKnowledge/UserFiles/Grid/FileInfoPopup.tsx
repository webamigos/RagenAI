import prettyBytes from 'pretty-bytes';
import { forwardRef } from 'react';
import { useTranslations } from 'next-intl';

type FileInfoPopupProps = {
  createdAt: string;
  updatedAt: string;
  fileSize: number;
};

export const FileInfoPopup = forwardRef<HTMLDivElement, FileInfoPopupProps>(
  ({ createdAt, updatedAt, fileSize }, ref) => {
    const t = useTranslations('files-table');

    return (
      <div
        ref={ref}
        className="absolute top-2 -right-52 bg-white shadow-lg border rounded-md px-2 text-sm w-60 z-50"
      >
        <table className="w-full">
          <tbody>
            <tr className="border-b border-gray-300">
              <td className="font-semibold p-2">{t('created')}:</td>
              <td className="p-2 text-right">{createdAt}</td>
            </tr>
            <tr className="border-b border-gray-300">
              <td className="font-semibold p-2">{t('updated')}:</td>
              <td className="p-2 text-right">{updatedAt}</td>
            </tr>
            <tr>
              <td className="font-semibold p-2">{t('file-size')}:</td>
              <td className="p-2 text-right">{prettyBytes(fileSize)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }
);
FileInfoPopup.displayName = 'FileInfoPopup';
