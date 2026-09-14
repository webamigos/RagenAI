// crypto-js is CommonJS and its named exports are not statically detectable
// by Node's ESM loader, so `import { AES }` compiles and then throws on first
// evaluation. The default import is the whole module object.
import cryptoJs from 'crypto-js';

const { AES, enc } = cryptoJs;

const SECRET_KEY = process.env.SECRET_KEY!;

export function decryptApiKey(encryptedApiKey: string): string {
  const bytes = AES.decrypt(encryptedApiKey, SECRET_KEY);
  return bytes.toString(enc.Utf8);
}
