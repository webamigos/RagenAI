import pl from '../src/app/messages/pl.json';
import en from '../src/app/messages/en.json';

const messagesByLocale: Record<string, any> = { en, pl };

const nextIntl = {
  defaultLocale: 'en',
  messagesByLocale,
};

export default nextIntl;
