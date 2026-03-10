import { logger } from '@/app/lib/utils/logger';
import { getFirefliesConnectorQuery } from './get-fireflies-connector-query';
import { fetchWithTimeout } from '../../utils/fetch-with-timeout';

export type FirefliesTranscript = {
  id: string;
  title: string;
  date: string;
  duration: number;
  organizer_email: string;
  participants: string[];
  transcript_url: string;
};

type SearchResponse = {
  success: boolean;
  transcripts?: FirefliesTranscript[];
  count?: number;
  error?: string;
};

export const searchFirefliesTranscriptsQuery = async (
  organizationId: string,
  userId: string,
  query: string = '',
): Promise<SearchResponse> => {
  const connector = await getFirefliesConnectorQuery(organizationId, userId);
  if (!connector) {
    return { success: false, error: 'Fireflies not connected' };
  }

  try {
    const params = new URLSearchParams({
      customer_id: connector.customer_id,
      query,
      limit: '20',
    });

    const response = await fetchWithTimeout(
      `${connector.baseUrl}/transcripts/search?${params}`,
    );
    if (!response.ok) {
      logger.error(
        { status: response.status },
        'Fireflies search returned error status',
      );
      return { success: false, error: 'Failed to search Fireflies' };
    }
    const data: SearchResponse = await response.json();
    if (!data.success) {
      logger.error({ error: data.error }, 'Fireflies search API error');
      return {
        success: false,
        error: data.error || 'Failed to search Fireflies',
      };
    }
    return data;
  } catch (error) {
    logger.error({ err: error }, 'Error searching Fireflies');
    return { success: false, error: 'Failed to search Fireflies' };
  }
};
