import { logger } from '@/app/lib/utils/logger';
import { getFirefliesConnectorQuery } from './get-fireflies-connector-query';
import { fetchWithTimeout } from '../../utils/fetch-with-timeout';

const FIREFLIES_GRAPHQL_URL = 'https://api.fireflies.ai/graphql';

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

type FirefliesGqlTranscriptDetail = {
  id: string;
  title: string;
  date: number;
  duration: number;
  participants: string[];
  transcript_url: string;
  sentences: { speaker_name: string; text: string }[];
};

const GET_TRANSCRIPT_QUERY = `
  query Transcript($transcriptId: String!) {
    transcript(id: $transcriptId) {
      id
      title
      date
      duration
      participants
      transcript_url
      sentences {
        speaker_name
        text
      }
    }
  }
`;

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
    const response = await fetchWithTimeout(FIREFLIES_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${connector.apiKey}`,
      },
      body: JSON.stringify({
        query: GET_TRANSCRIPT_QUERY,
        variables: { transcriptId },
      }),
    });

    if (!response.ok) {
      logger.error(
        { status: response.status, transcriptId },
        'Fireflies transcript fetch returned error status',
      );
      return { success: false, error: 'Failed to fetch transcript content' };
    }

    const data = (await response.json()) as {
      data?: { transcript: FirefliesGqlTranscriptDetail };
      errors?: { message: string }[];
    };

    if (data.errors?.length) {
      logger.error({ errors: data.errors }, 'Fireflies GraphQL error');
      return {
        success: false,
        error: data.errors[0].message || 'Failed to fetch transcript content',
      };
    }

    const transcript = data.data?.transcript;
    if (!transcript) {
      return { success: false, error: 'Transcript not found' };
    }

    // Build readable transcript content from sentences
    const content = (transcript.sentences ?? [])
      .map((s) => `${s.speaker_name}: ${s.text}`)
      .join('\n');

    return {
      success: true,
      transcript_id: transcript.id,
      title: transcript.title || 'Untitled Meeting',
      date: new Date(transcript.date).toISOString(),
      duration: transcript.duration ?? 0,
      participants: transcript.participants ?? [],
      transcript_url: transcript.transcript_url ?? '',
      content,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error fetching Fireflies transcript');
    return { success: false, error: 'Failed to fetch transcript content' };
  }
};
