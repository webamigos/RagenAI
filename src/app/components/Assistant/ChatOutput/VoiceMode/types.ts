import { type MessageContentType } from '@/generated/prisma/browser';

export type VoiceModeProps = {
  onClose: () => void;
  isRecording: boolean;
  onResult: (text: string, recordingTime: number) => void;
  messages: Array<{
    role: string;
    content: string;
    message_type?: MessageContentType;
    voice_played?: boolean;
    public_id?: string;
  }>;
  onMessagePlayed?: (messageId: string) => void;
  voiceId: string;
  assistantError: string | null;
};

export type VoiceModeState = {
  currentMessages: VoiceModeProps['messages'];
  hasApiError: boolean;
  isGeneratingAudio: boolean;
  isPlayingAudio: boolean;
  recordingTime: number;
  transcriptText: string;
  localIsRecording: boolean;
  isWaitingForResponse: boolean;
  error: Error | null;
};

export type VoiceModeHandlers = {
  handleClose: () => void;
  handleStartRecording: () => void;
  handleStopRecording: () => void;
};

export type VoiceModeButtonProps = {
  isRecording: boolean;
  isPlayingAudio: boolean;
  isGeneratingAudio: boolean;
  isWaitingForResponse: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
};

export type VoiceModeHeaderProps = {
  onClose: () => void;
  disabled: boolean;
};

export type VoiceModeStatusProps = {
  isRecording: boolean;
  isGeneratingAudio: boolean;
  isPlayingAudio: boolean;
  recordingTime: number;
  isWaitingForResponse: boolean;
  error: Error | null;
};

export type VoiceModeTranscriptProps = {
  text: string;
};

export type VoiceModeInstructionsProps = {
  hasApiError: boolean;
  voiceError?: string | null;
};
