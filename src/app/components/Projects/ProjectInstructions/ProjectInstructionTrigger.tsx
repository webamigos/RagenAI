import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Card, Dialog, Text } from '@ragenai/common-ui';
import { ProjectInstructionForm } from './ProjectInstructionForm';

type ProjectInstructionTriggerProps = {
  projectId: string;
  projectPublicId: string;
};

export const ProjectInstructionTrigger = ({
  projectPublicId,
}: ProjectInstructionTriggerProps) => {
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const t = useTranslations('projects');

  const handleDialogClose = () => {
    setShowInstructionsModal(false);
  };

  const handleInstructionSuccess = () => {
    setShowInstructionsModal(false);
  };

  return (
    <>
      <Card
        size="full"
        onClick={() => setShowInstructionsModal(true)}
        className="cursor-pointer h-28"
      >
        <Text>{t('project-instructions.button')}</Text>
        <Text fontSize="xs">{t('project-instructions.description')}</Text>
      </Card>

      <Dialog
        className=" w-full max-w-lg max-h-[600px] overflow-y-auto"
        open={showInstructionsModal}
        onClose={handleDialogClose}
      >
        <div className="flex flex-col gap-2">
          <ProjectInstructionForm
            projectId={projectPublicId}
            onSuccess={handleInstructionSuccess}
            onCancel={handleDialogClose}
          />
        </div>
      </Dialog>
    </>
  );
};
