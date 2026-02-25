import { useState, useEffect, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';

import { logger } from '../lib/utils/logger';
import { statusToast } from '../lib/utils/toast';

type UseVoiceInputProps = {
  onResult: (text: string) => void;
};

const localeToSpeechLang = (locale: string): string => {
  switch (locale) {
    case 'en':
      return 'en-US';
    case 'pl':
      return 'pl-PL';
    default:
      return 'pl-PL';
  }
};

export const useVoiceInput = ({ onResult }: UseVoiceInputProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Web Speech API types are incomplete in TypeScript's DOM lib
  // (missing onspeechend, maxAlternatives, mismatched event types)
  const recognitionRef = useRef<any>(null);

  const locale = useLocale();

  const t = useTranslations('useAudioRecorder');

  const { errorToast } = statusToast();

  const speechEndDelay = 3000;

  const cleanupRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.onstart = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.onspeechend = null;
      recognitionRef.current.onerror = null;

      try {
        recognitionRef.current.stop();
      } catch (e) {
        logger.error({ err: e });
      }
      recognitionRef.current = null;
    }
    setIsRecording(false);
  };

  const checkBrowserCompatibility = () => {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
      logger.error('Browser does not support Web Speech API');
      setError(t('browser-not-compatibility'));
      return false;
    }
    return true;
  };

  const initializeRecognition = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    let silenceTimeout: NodeJS.Timeout | null = null;

    if (!SpeechRecognition) {
      setError(t('browser-not-compatibility'));
      return null;
    }

    // Cast to any — TypeScript's SpeechRecognition types are incomplete
    // (missing onspeechend, maxAlternatives, mismatched event types)
    const recognition: any = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = localeToSpeechLang(locale);

    logger.info(
      {
        continuous: recognition.continuous,
        interimResults: recognition.interimResults,
        lang: recognition.lang,
        maxAlternatives: recognition.maxAlternatives,
      },
      'Speech recognition configuration'
    );

    recognition.onstart = () => {
      setIsRecording(true);
      setError(null);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';

      // Get the last result
      const lastResultIndex = event.results.length - 1;
      const lastResult = event.results[lastResultIndex];

      // Process all results
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + ' ';
        } else {
          interimTranscript += result[0].transcript + ' ';
        }
      }

      // Only update if we have some text
      const trimmedFinal = finalTranscript.trim();
      const trimmedInterim = interimTranscript.trim();

      if (trimmedFinal) {
        onResult(trimmedFinal);
      } else if (trimmedInterim) {
        logger.info({ transcript: trimmedInterim }, 'Interim transcript');
        onResult(trimmedInterim);
      }

      // Reset silence timeout
      if (silenceTimeout) {
        clearTimeout(silenceTimeout);
      }

      // Only start silence timeout if we have some text
      if (trimmedFinal || trimmedInterim) {
        silenceTimeout = setTimeout(() => {
          cleanupRecognition();
        }, speechEndDelay);
      }
    };

    recognition.onspeechend = () => {
      cleanupRecognition();
    };

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      const errorMessage =
        e.error === 'not-allowed'
          ? t('microphone-permission-denied')
          : t('recognition-error');

      setError(errorMessage);

      logger.error(
        {
          error: {
            type: e.error,
            message: e.message,
            event: e,
          },
        },
        'Recognition error'
      );

      cleanupRecognition();
    };

    return recognition;
  };

  const startListening = async () => {
    if (!checkBrowserCompatibility()) {
      return;
    }

    cleanupRecognition();

    try {
      // Check microphone permissions
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!stream) {
        throw new Error('Microphone permission denied');
      }

      // Ensure we have access to the microphone
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) {
        throw new Error('No audio tracks available');
      }

      const recognition = initializeRecognition();
      if (recognition) {
        recognitionRef.current = recognition;
        recognition.start();
      }

      // Cleanup stream when done
      return () => {
        stream.getTracks().forEach((track) => track.stop());
      };
    } catch (err) {
      setError(t('recognition-error'));
      if (err instanceof Error) {
        errorToast({ message: err.message });
      }
      logger.error({ error: err }, 'Recognition error');
      cleanupRecognition();
    }
  };

  const stopListening = () => {
    cleanupRecognition();
  };

  useEffect(() => {
    return () => {
      cleanupRecognition();
    };
  }, []);

  return {
    startListening,
    stopListening,
    isRecording,
    error,
  };
};
