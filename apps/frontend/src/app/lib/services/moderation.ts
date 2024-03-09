import { type AxiosResponse } from 'axios';

import { openAIInstance } from './config';

type ModerationResponse = {
  id: string;
  model: string;
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

export const sendForModeration = async (
  input: string
): Promise<AxiosResponse<ModerationResponse>> => {
  return openAIInstance.post('/moderations', { input });
};
