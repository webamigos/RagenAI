import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Card } from '@ragenai/common-ui/Card';
import { Dialog } from '@ragenai/common-ui/Dialog';
import { Text } from '@ragenai/common-ui/Text';
import { ProjectInstructionForm } from './ProjectInstructionForm';

type ProjectInstructionTriggerProps = {
  projectId: string;
};

export const ProjectInstructionTrigger = ({
  projectId,
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
        className="w-full max-w-2xl max-h-[700px] overflow-y-auto"
        open={showInstructionsModal}
        onClose={handleDialogClose}
      >
        <div className="flex flex-col gap-2">
          <ProjectInstructionForm
            projectId={projectId}
            onSuccess={handleInstructionSuccess}
            onCancel={handleDialogClose}
          />
        </div>
      </Dialog>
    </>
  );
};
