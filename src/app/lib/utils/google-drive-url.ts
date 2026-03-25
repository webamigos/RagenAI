/**
 * Parses a Google Drive/Docs URL and extracts the file ID.
 *
 * Supported URL patterns:
 * - https://docs.google.com/document/d/FILE_ID/...
 * - https://docs.google.com/spreadsheets/d/FILE_ID/...
 * - https://docs.google.com/presentation/d/FILE_ID/...
 * - https://drive.google.com/file/d/FILE_ID/...
 * - https://drive.google.com/open?id=FILE_ID
 * - https://docs.google.com/document/u/0/d/FILE_ID/...  (account selector)
 */

const DRIVE_FILE_ID_REGEX =
  /https?:\/\/(?:docs|drive)\.google\.com\/(?:document|spreadsheets|presentation|file)\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/;

const DRIVE_OPEN_REGEX =
  /https?:\/\/drive\.google\.com\/(?:u\/\d+\/)?open\?id=([a-zA-Z0-9_-]+)/;

export function extractDriveFileId(url: string): string | null {
  const match = url.match(DRIVE_FILE_ID_REGEX) || url.match(DRIVE_OPEN_REGEX);
  return match?.[1] ?? null;
}

export function isGoogleDriveUrl(url: string): boolean {
  return extractDriveFileId(url) !== null;
}

/**
 * Extracts all Google Drive file IDs from a text string.
 * Returns an array of { fileId, url } objects.
 */
export function extractDriveLinksFromText(
  text: string,
): { fileId: string; url: string }[] {
  const results: { fileId: string; url: string }[] = [];
  const urlRegex = /https?:\/\/[^\s)>\]]+/g;
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[0];
    const fileId = extractDriveFileId(url);
    if (fileId) {
      results.push({ fileId, url });
    }
  }

  return results;
}

/**
 * Returns a human-readable file type label based on the Google Drive MIME type or URL pattern.
 */
export function getDriveFileTypeFromUrl(url: string): string {
  if (url.includes('docs.google.com/document')) {
    return 'DOC';
  }
  if (url.includes('docs.google.com/spreadsheets')) {
    return 'SHEET';
  }
  if (url.includes('docs.google.com/presentation')) {
    return 'SLIDES';
  }
  return 'FILE';
}
