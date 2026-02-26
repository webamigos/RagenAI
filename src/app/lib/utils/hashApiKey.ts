import { AES, enc } from 'crypto-js';

const SECRET_KEY = process.env.SECRET_KEY!;

export function encryptApiKey(apiKey: string): string {
  return AES.encrypt(apiKey, SECRET_KEY).toString();
}

export function decryptApiKey(encryptedApiKey: string): string {
  const bytes = AES.decrypt(encryptedApiKey, SECRET_KEY);
  return bytes.toString(enc.Utf8);
}

export const maskApiKey = (apiKey: string): string => {
  if (apiKey.length <= 8) {
    return apiKey;
  }
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
};
