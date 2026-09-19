// crypto-js is CommonJS and its named exports are not statically detectable by
// Node's ESM loader, so `import { AES } from 'crypto-js'` typechecks, bundles
// and then throws at import time under plain ESM — which is how every `tsx`
// script that reaches this module dies before running a line of its own. The
// bundler papers over it; `npx tsx src/scripts/seed-demo-organization.ts` does
// not. The default import is the whole module object, so destructure from it.
// `apps/api` and `apps/worker` already import it this way.
import cryptoJs from 'crypto-js';

const { AES, enc } = cryptoJs;

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
