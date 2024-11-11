import db from '@salesyy/prisma-client';

import { openAIInstance } from './config';
import { setSentryServiceTag } from './sentry';
import { Sentry } from 'pino-sentry';

const serviceName = 'moderation';

type OpenAIModerationResponse = {
  id: string;
  model: string;
  error?: object;
  results: [
    {
      flagged: boolean;
      categories: {
        sexual: boolean;
        hate: boolean;
        harassment: boolean;
        'self-harm': boolean;
        'sexual/minors': boolean;
        'hate/threatening': boolean;
        'violence/graphic': boolean;
        'self-harm/intent': boolean;
        'self-harm/instructions': boolean;
        'harassment/threatening': boolean;
        violence: boolean;
      };
      category_scores: {
        sexual: number;
        hate: number;
        harassment: number;
        'self-harm': number;
        'sexual/minors': number;
        'hate/threatening': number;
        'violence/graphic': number;
        'self-harm/intent': number;
        'self-harm/instructions': number;
        'harassment/threatening': number;
        violence: number;
      };
    }
  ];
};

type ModerationResponse = {
  isFlagged: boolean;
};

export const sendForModeration = async (
  input: string
): Promise<ModerationResponse> => {
  try {
    setSentryServiceTag(serviceName);
    // TODO: uncomment
    return { isFlagged: false };

    // const response = await openAIInstance.post<OpenAIModerationResponse>(
    //   '/moderations',
    //   { input }
    // );

    // const data = response.data;

    // console.log('response data: ', { data });

    // const moderationError = data.error;
    // if (moderationError) {
    //   console.log({ moderationError });
    // }

    // const isFlagged = !!data.results[0].flagged;

    // if (isFlagged) {
    //   await db.flaggedMessage.create({
    //     data: { content: input },
    //   });
    // }

    // return { isFlagged };
  } catch (_error) {
    Sentry.captureException(_error);
    // console.log()
    // console.error('Moderation error: ', _error);
    throw new Error('Fail to check moderation');
  }
};
