import { useTranslations } from 'next-intl';

export default function Index() {
  const t = useTranslations('Index');
  /*
   * Replace the elements below with your own.
   *
   * Note: The corresponding styles are in the ./index.none file.
   */
  return (
    <>
      <h1>{t('title')}</h1>
    </>
  );
}
