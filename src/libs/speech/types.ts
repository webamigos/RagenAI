export interface TtsProvider {
  synthesize(text: string, voiceId: string): Promise<Buffer>;
}

export interface SttProvider {
  transcribe(
    audioBuffer: Buffer,
    mimeType: string,
    language?: string,
  ): Promise<string>;
}
