import axios, { AxiosError } from 'axios';
import { NextResponse } from 'next/server';

import { logger } from '../../lib/utils/logger';

const SERVER_URL = 'https://api.heygen.com';
const HEYGEN_AVATAR_ID = process.env.HEYGEN_AVATAR_ID;
const HEYGEN_API_TOKEN = process.env.HEYGEN_API_TOKEN;

type HeygenSessionResponseDto = {
  code: string;
  data: {
    ice_servers: string[];
    sdp: {
      sdp: string;
      type: string;
    };
    session_id: string;
  };
  message: string;
};

export const dynamic = 'force-dynamic';

export const POST = async () => {
  try {
    await axios.post<HeygenSessionResponseDto>(
      `${SERVER_URL}/v1/streaming.new`,
      {
        quality: 'high',
        avatar_name: HEYGEN_AVATAR_ID,
        voice: {
          voice_id: '',
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': HEYGEN_API_TOKEN,
        },
      }
    );

    return NextResponse.json({});
  } catch (error) {
    if (error instanceof AxiosError) {
      logger.error('Axios error: %o', error);
    }
  }
};
