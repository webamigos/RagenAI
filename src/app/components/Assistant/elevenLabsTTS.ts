import { logger } from '@/app/lib/utils/logger';

export const convertTextToSpeech = async (
  text: string,
  voiceId: string,
): Promise<string> => {
  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceId }),
    });

    if (!response.ok) {
      throw new Error(`TTS request failed with status ${response.status}`);
    }

    const audioBlob = await response.blob();
    return URL.createObjectURL(audioBlob);
  } catch (error) {
    logger.error({ err: error }, 'Error in text to speech conversion');
    throw new Error('Failed to convert text to speech');
  }
};
