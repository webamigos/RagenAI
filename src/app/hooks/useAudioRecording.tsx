import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';

import { logger } from '../lib/utils/logger';
import { statusToast } from '../lib/utils/toast';

type UseVoiceInputProps = {
  onTranscription: (fullText: string) => void;
  onRecordingStart?: () => void;
};

const LOCALE_TO_LANGUAGE: Record<string, string> = {
  en: 'eng',
  pl: 'pol',
};

const localeToLanguageCode = (locale: string): string => {
  const lang = LOCALE_TO_LANGUAGE[locale];
  if (!lang) {
    logger.warn(
      { locale },
      'Unsupported locale for transcription, falling back to Polish',
    );
    return 'pol';
  }
  return lang;
};

async function transcribeAudio(
  audioBlob: Blob,
  language: string,
): Promise<string> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');
  formData.append('language', language);

  const response = await fetch('/api/transcribe', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let errorMessage = 'Transcription failed';
    try {
      const error = await response.json();
      errorMessage = error.error || errorMessage;
    } catch {
      // Response was not JSON
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  return data.text;
}

// How often to send accumulated audio for transcription (ms)
const CHUNK_INTERVAL = 5000;

export const useVoiceInput = ({
  onTranscription,
  onRecordingStart,
}: UseVoiceInputProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isTranscribingRef = useRef(false);
  const pendingTranscribeRef = useRef(false);

  const locale = useLocale();
  const t = useTranslations('useAudioRecorder');
  const { errorToast } = statusToast();

  const cleanupRecording = useCallback(() => {
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === 'recording'
    ) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    isTranscribingRef.current = false;
    pendingTranscribeRef.current = false;
    setIsRecording(false);
  }, []);

  const sendForTranscription = useCallback(async () => {
    if (audioChunksRef.current.length === 0) {
      return;
    }

    if (isTranscribingRef.current) {
      pendingTranscribeRef.current = true;
      return;
    }

    isTranscribingRef.current = true;

    // Always build blob from ALL chunks — webm header is in chunk 0
    const audioBlob = new Blob([...audioChunksRef.current], {
      type: 'audio/webm',
    });

    if (audioBlob.size > 0) {
      try {
        const language = localeToLanguageCode(locale);
        const fullText = await transcribeAudio(audioBlob, language);
        // Send the full transcription — the consumer handles replacing, not appending
        onTranscription(fullText.trim());
      } catch (err) {
        logger.error({ error: err }, 'ElevenLabs chunk transcription error');
      }
    }

    isTranscribingRef.current = false;

    if (pendingTranscribeRef.current) {
      pendingTranscribeRef.current = false;
      sendForTranscription();
    }
  }, [locale, onTranscription]);

  const startListening = async () => {
    cleanupRecording();
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) {
        throw new Error('No audio tracks available');
      }

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }

        if (chunkIntervalRef.current) {
          clearInterval(chunkIntervalRef.current);
          chunkIntervalRef.current = null;
        }

        // Final transcription of everything
        const audioBlob = new Blob([...audioChunksRef.current], {
          type: 'audio/webm',
        });
        audioChunksRef.current = [];

        if (audioBlob.size > 0) {
          try {
            const language = localeToLanguageCode(locale);
            const fullText = await transcribeAudio(audioBlob, language);
            onTranscription(fullText.trim());
          } catch (err) {
            const message =
              err instanceof Error ? err.message : t('recognition-error');
            setError(message);
            errorToast({ message });
            logger.error({ error: err }, 'ElevenLabs transcription error');
          }
        }

        setIsRecording(false);
      };

      mediaRecorder.onerror = () => {
        setError(t('recognition-error'));
        cleanupRecording();
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);
      setIsRecording(true);
      onRecordingStart?.();

      // Periodically transcribe all accumulated audio
      chunkIntervalRef.current = setInterval(() => {
        sendForTranscription();
      }, CHUNK_INTERVAL);
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'NotAllowedError'
          ? t('microphone-permission-denied')
          : t('recognition-error');
      setError(message);
      if (err instanceof Error) {
        errorToast({ message: err.message });
      }
      logger.error({ error: err }, 'Recording error');
      cleanupRecording();
    }
  };

  const stopListening = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === 'recording'
    ) {
      mediaRecorderRef.current.stop();
    } else {
      cleanupRecording();
    }
  };

  useEffect(() => {
    return () => {
      cleanupRecording();
    };
  }, [cleanupRecording]);

  return {
    startListening,
    stopListening,
    isRecording,
    error,
  };
};
