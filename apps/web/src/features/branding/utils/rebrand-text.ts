import { DEFAULT_PRODUCT_NAME } from '../contracts/branding.types';

/**
 * The phrases that name the product in the message catalogues — page titles
 * ("Sign in | Ragen AI"), "to continue to Ragen Assistant", and the email
 * subjects and bodies.
 *
 * Whole phrases only. The bare word "Ragen" also appears in copy ("Back to
 * Ragen", "Ragen Brain"), where it is sometimes the product and sometimes a
 * feature's name; replacing it blindly would rename features too. Those
 * strings are left for a later pass that rewrites them deliberately.
 */
const PRODUCT_PHRASES = /Ragen (?:AI|Assistant)/g;

export function rebrandText(text: string, productName: string): string {
  if (productName === DEFAULT_PRODUCT_NAME) {
    return text;
  }
  // A function, not the string: `replace` reads `$&` and `$1` in a
  // replacement string as patterns, and the name is whatever an operator typed.
  return text.replace(PRODUCT_PHRASES, () => productName);
}

type Messages = { [key: string]: string | Messages };

/**
 * The last rebranded copy per catalogue. A catalogue is one module object per
 * locale, so this holds at most one copy per locale, and a renamed product
 * replaces its entry instead of adding one.
 */
const rebranded = new WeakMap<object, { productName: string; copy: object }>();

/**
 * A copy of a message catalogue with every product phrase replaced.
 *
 * Returns the input itself when there is nothing to do, and never mutates
 * it: the catalogue is a module that every request shares, so changing it in
 * place would keep the old name after a rename, and keep a custom name after
 * the feature key is switched off.
 */
export function rebrandMessages<T extends object>(
  messages: T,
  productName: string,
): T {
  if (productName === DEFAULT_PRODUCT_NAME) {
    return messages;
  }

  const cached = rebranded.get(messages);
  if (cached?.productName === productName) {
    return cached.copy as T;
  }

  const walk = (node: Messages): Messages => {
    const out: Messages = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] =
        typeof value === 'string'
          ? rebrandText(value, productName)
          : walk(value);
    }
    return out;
  };

  const copy = walk(messages as unknown as Messages);
  rebranded.set(messages, { productName, copy });
  return copy as unknown as T;
}
