import { logger } from '@/app/lib/utils/logger';
import { getFirefliesConnectorQuery } from './get-fireflies-connector-query';
import { fetchWithTimeout } from '../../utils/fetch-with-timeout';

const FIREFLIES_GRAPHQL_URL = 'https://api.fireflies.ai/graphql';

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

type FirefliesGqlTranscript = {
  id: string;
  title: string;
  date: number;
  duration: number;
  organizer_email: string;
  participants: string[];
  transcript_url: string;
};

const LIST_TRANSCRIPTS_QUERY = `
  query Transcripts($limit: Int) {
    transcripts(limit: $limit) {
      id
      title
      date
      duration
      organizer_email
      participants
      transcript_url
    }
  }
`;

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
    const response = await fetchWithTimeout(FIREFLIES_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${connector.apiKey}`,
      },
      body: JSON.stringify({
        query: LIST_TRANSCRIPTS_QUERY,
        variables: { limit: 50 },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.error(
        { status: response.status, body },
        'Fireflies GraphQL returned error status',
      );
      return { success: false, error: 'Failed to search Fireflies' };
    }

    const data = (await response.json()) as {
      data?: { transcripts: FirefliesGqlTranscript[] };
      errors?: { message: string }[];
    };

    if (data.errors?.length) {
      logger.error({ errors: data.errors }, 'Fireflies GraphQL error');
      return {
        success: false,
        error: data.errors[0].message || 'Failed to search Fireflies',
      };
    }

    let transcripts = (data.data?.transcripts ?? []).map((t) => ({
      id: t.id,
      title: t.title || 'Untitled Meeting',
      date: new Date(t.date).toISOString(),
      duration: t.duration ?? 0,
      organizer_email: t.organizer_email ?? '',
      participants: t.participants ?? [],
      transcript_url: t.transcript_url ?? '',
    }));

    // Client-side filtering when query is provided
    if (query.trim()) {
      const lowerQuery = query.toLowerCase();
      transcripts = transcripts.filter(
        (t) =>
          t.title.toLowerCase().includes(lowerQuery) ||
          t.organizer_email.toLowerCase().includes(lowerQuery) ||
          t.participants.some((p) => p.toLowerCase().includes(lowerQuery)),
      );
    }

    return {
      success: true,
      transcripts: transcripts.slice(0, 20),
      count: transcripts.length,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error searching Fireflies');
    return {
      success: false,
      error: 'Failed to search Fireflies',
    };
  }
};
