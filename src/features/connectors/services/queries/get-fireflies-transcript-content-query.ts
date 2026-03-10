import { logger } from '@/app/lib/utils/logger';
import { getFirefliesConnectorQuery } from './get-fireflies-connector-query';
import { fetchWithTimeout } from '../../utils/fetch-with-timeout';

export type TranscriptContentResponse = {
  success: boolean;
  transcript_id?: string;
  title?: string;
  date?: string;
  duration?: number;
  participants?: string[];
  transcript_url?: string;
  content?: string;
  error?: string;
};

export const getFirefliesTranscriptContentQuery = async (
  organizationId: string,
  userId: string,
  transcriptId: string,
): Promise<TranscriptContentResponse> => {
  const connector = await getFirefliesConnectorQuery(organizationId, userId);
  if (!connector) {
    return { success: false, error: 'Fireflies not connected' };
  }

  try {
    const params = new URLSearchParams({
      customer_id: connector.customer_id,
    });

    const response = await fetchWithTimeout(
      `${connector.baseUrl}/transcripts/${encodeURIComponent(transcriptId)}?${params}`,
    );
    if (!response.ok) {
      logger.error(
        { status: response.status, transcriptId },
        'Fireflies transcript fetch returned error status',
      );
      return { success: false, error: 'Failed to fetch transcript content' };
    }
    const data: TranscriptContentResponse = await response.json();
    return data;
  } catch (error) {
    logger.error({ err: error }, 'Error fetching Fireflies transcript');
    return { success: false, error: 'Failed to fetch transcript content' };
  }
};
