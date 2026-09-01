import { useState } from 'react';
import { disablePublicAccessCommand as disablePublicAccessForProject } from '@/features/projects/services/commands/disable-public-access-command';

export const useDisablePublicAccess = (projectId: string) => {
  const [isDisabling, setIsDisabling] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleDisablePublicAccess = async () => {
    if (!projectId) {
      return false;
    }

    try {
      setIsDisabling(true);
      setError(null);

      const { success } = await disablePublicAccessForProject(projectId);

      if (!success) {
        throw new Error('Failed to disable public access');
      }

      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? err
          : new Error('Failed to disable public access'),
      );
      return false;
    } finally {
      setIsDisabling(false);
    }
  };

  return { disablePublicAccess: handleDisablePublicAccess, isDisabling, error };
};
