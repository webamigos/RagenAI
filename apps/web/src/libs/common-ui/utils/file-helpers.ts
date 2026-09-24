/**
 * The short type tag shown beside a document's name: its extension, upper
 * case. A web page is stored under its URL, so the last dot there belongs to
 * the domain — "https://example.pl/zwroty" used to tag itself
 * "PL/ZWROTY". A URL is tagged URL, and anything after the last dot that
 * does not look like an extension falls back to DOC.
 */
export const getFileLabel = (filename: string): string => {
  if (/^https?:\/\//i.test(filename.trim())) {
    return 'URL';
  }
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex !== -1) {
    const ext = filename.slice(dotIndex + 1);
    if (/^[a-z0-9]{1,5}$/i.test(ext)) {
      return ext.toUpperCase();
    }
  }
  return 'DOC';
};
