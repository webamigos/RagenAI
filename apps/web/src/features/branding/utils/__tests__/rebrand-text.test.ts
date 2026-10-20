import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import en from '@/app/messages/en.json';
import pl from '@/app/messages/pl.json';

import { rebrandMessages, rebrandText } from '../rebrand-text';

describe('rebrandText', () => {
  it('replaces the product phrases', () => {
    expect(rebrandText('Sign In | Ragen AI', 'Acme')).toBe('Sign In | Acme');
    expect(rebrandText('to continue to Ragen Assistant', 'Acme')).toBe(
      'to continue to Acme',
    );
  });

  it('leaves the bare word alone, where it may name a feature', () => {
    expect(rebrandText('Ragen Brain', 'Acme')).toBe('Ragen Brain');
    expect(rebrandText('Back to Ragen', 'Acme')).toBe('Back to Ragen');
  });

  it('does nothing for the default name', () => {
    expect(rebrandText('Sign In | Ragen AI', 'Ragen AI')).toBe(
      'Sign In | Ragen AI',
    );
  });

  it('inserts the name literally, even when it looks like a replacement pattern', () => {
    expect(rebrandText('Sign In | Ragen AI', 'A $& B $1')).toBe(
      'Sign In | A $& B $1',
    );
  });
});

describe('rebrandMessages', () => {
  it('renames every page title, in English and Polish', () => {
    const renamed = rebrandMessages(en, 'Acme');
    expect(renamed.Metadata['sign-in'].title).toBe('Sign In | Acme');
    expect(JSON.stringify(renamed.Metadata)).not.toContain('Ragen AI');

    const renamedPl = rebrandMessages(pl, 'Acme');
    expect(JSON.stringify(renamedPl.Metadata)).not.toContain('Ragen AI');
  });

  it('never changes the shared catalogue it was given', () => {
    const before = en.Metadata['sign-in'].title;
    rebrandMessages(en, 'Acme');
    expect(en.Metadata['sign-in'].title).toBe(before);
  });

  it('hands back the same catalogue for the default name', () => {
    expect(rebrandMessages(en, 'Ragen AI')).toBe(en);
  });

  it('reuses one copy per name, and makes a new one after a rename', () => {
    const first = rebrandMessages(en, 'Acme');
    expect(rebrandMessages(en, 'Acme')).toBe(first);

    const renamed = rebrandMessages(en, 'Globex');
    expect(renamed).not.toBe(first);
    expect(renamed.Metadata['sign-in'].title).toBe('Sign In | Globex');
  });

  it.each(['Acme {AI}', 'Acme <b>', "O'Brien's", "Acme'{x}"])(
    'formats a name with ICU syntax in it literally: %s',
    (name) => {
      const t = createTranslator({
        locale: 'en',
        messages: rebrandMessages(en, name),
        onError: (err) => {
          throw err;
        },
      });
      expect(t('Metadata.sign-in.title')).toBe(`Sign In | ${name}`);
    },
  );
});
