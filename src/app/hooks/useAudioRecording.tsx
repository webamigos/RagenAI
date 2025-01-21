import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

type UseVoiceInputProps = {
  onResult: (text: string) => void;
};

export const useVoiceInput = ({ onResult }: UseVoiceInputProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const t = useTranslations('useAudioRecorder');

  const cleanupRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.onstart = null;
      recognitionRef.current.onend = null;
      recognitionRef.current.onresult = null;
      recognitionRef.current.onspeechend = null;
      recognitionRef.current.onerror = null;

      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }
    setIsRecording(false);
  };

  const initializeRecognition = () => {
    const SpeechRecognition =
      window.SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError(t('browser-not-compatibility'));
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pl-PL';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsRecording(true);
      setError(null);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
    };

    recognition.onspeechend = () => {
      cleanupRecognition();
    };

    recognition.onerror = (e: any) => {
      setError(t('recognition-error'));
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
