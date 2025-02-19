import { ElevenLabsClient } from 'elevenlabs';

import { logger } from '@/app/lib/utils/logger';

const apiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;

const client = new ElevenLabsClient({ apiKey });

export const convertTextToSpeech = async (
  text: string,
  voiceId: string
): Promise<string> => {
  try {
    const response = await client.textToSpeech.convert(voiceId, {
      output_format: 'mp3_44100_128',
      text,
      model_id: 'eleven_multilingual_v2',
    });
    const chunks: Uint8Array[] = [];

    for await (const chunk of response) {
      chunks.push(chunk);
    }

    const audioBlob = new Blob(chunks, { type: 'audio/mpeg' });
    return URL.createObjectURL(audioBlob);
  } catch (error) {
    logger.error({ err: error }, 'Error in text to speech conversion');
    throw new Error('Failed to convert text to speech');
  }
};
