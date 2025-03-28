import { useState } from 'react';
import { generateProjectKey } from '@/app/lib/services/project';

export const useProjectKeyGenerator = (projectId: number) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const generateKey = async () => {
    if (!projectId) return null;

    try {
      setIsGenerating(true);
      setError(null);
      const { accessToken } = await generateProjectKey(projectId);
      return accessToken;
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error('Failed to generate key')
      );
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  return { generateKey, isGenerating, error };
};
