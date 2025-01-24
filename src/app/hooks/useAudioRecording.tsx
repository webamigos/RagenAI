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
  const recognitionRef = useRef<SpeechRecognition | null>(null);
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

  const initializeRecognition = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    let silenceTimeout: NodeJS.Timeout | null = null;

    if (!SpeechRecognition) {
      setError(t('browser-not-compatibility'));
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = localeToSpeechLang(locale);

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

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];

        if (result.isFinal) {
          finalTranscript += result[0].transcript + ' ';
        } else {
          interimTranscript += result[0].transcript + ' ';
        }
      }

      if (finalTranscript) {
        onResult(finalTranscript.trim());
      } else {
        onResult(interimTranscript.trim());
      }
      if (silenceTimeout) clearTimeout(silenceTimeout);
      silenceTimeout = setTimeout(() => {
        cleanupRecognition();
      }, speechEndDelay);
    };

    recognition.onspeechend = () => {
      cleanupRecognition();
    };

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      setError(t('recognition-error'));

      logger.error(
        {
          error: { message: e },
        },
        'Recognition error'
      );

      cleanupRecognition();
    };

    return recognition;
  };

  const startListening = () => {
    cleanupRecognition();

    try {
      const recognition = initializeRecognition();
      if (recognition) {
        recognitionRef.current = recognition;
        recognition.start();
      }
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
