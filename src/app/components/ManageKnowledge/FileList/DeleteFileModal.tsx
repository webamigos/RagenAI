import { useTranslations } from 'next-intl';
import {
  Button,
  Card,
  SpinnerSVG,
  Text,
  TrashIcon,
  XMarkIcon,
  classMerge,
} from '@ragenai/common-ui';

type Props = {
  className?: string;
  isLoading?: boolean;
  fileName: string;
  toggleModal: (fileId?: string | null) => void;
  handleDelete: () => void;
};

export const DeleteFileModal = ({
  className,
  fileName,
  isLoading,
  toggleModal,
  handleDelete,
}: Props) => {
  const t = useTranslations('file-delete-modal');

  return (
    <div
      className="fixed top-0 left-0 z-50 flex items-center justify-center w-full h-full bg-black bg-opacity-50"
      onClick={() => toggleModal(null)}
    >
      <Card
        size="md"
        className={classMerge(
          'relative p-6 bg-white rounded-lg shadow-lg',
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-row flex-wrap">
          <Text>{t('are-you-sure')}:</Text>{' '}
          <Text fontWeight="medium">{fileName}?</Text>
        </div>
        <div className="flex justify-center mt-4 gap-2">
          <Button
            onClick={handleDelete}
            iconRight={
              isLoading ? (
                <SpinnerSVG size="sm" />
              ) : (
                <TrashIcon className="w-4 h-4" />
              )
            }
          >
            {t('yes')}
          </Button>
          <Button
            onClick={() => toggleModal(null)}
            iconRight={<XMarkIcon className="w-5 h-5" />}
          >
            {t('no')}
          </Button>
        </div>
      </Card>
    </div>
  );
};
