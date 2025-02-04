import { formatDates } from '@/app/lib/utils/formatDate';
import { format } from 'date-fns';

/**
 * This function renames `public_id` field to `id`
 * It's important from our perspective to share only public_id value but
 * from DX developers prefer to use id field instead of public id
 * So this function makes:
 * 1. renames object property public_id to id
 * 2. to it recursively
 *
 * @param record
 * @returns
 */
export const parseResponse = <T>(record: T | T[]) => {
  const replacer = (elem: any): any => {
    if (Array.isArray(elem)) {
      return elem.map(replacer);
    } else if (elem && typeof elem === 'object') {
      const { public_id, created_at, updated_at, ...doc } = elem;
      const normalizedDoc = {
        id: public_id,
        ...doc,
      };
      if (created_at) {
        normalizedDoc['created_at'] = created_at.toISOString();
      }
      if (updated_at) {
        normalizedDoc['updated_at'] = updated_at.toISOString();
      }

      // Recursively normalize nested objects
      Object.keys(normalizedDoc).forEach((key) => {
        normalizedDoc[key] = replacer(normalizedDoc[key]);
      });
      return normalizedDoc;
    }
    return elem; // Return unchanged if not an object or array
  };

  if (Array.isArray(record)) {
    return record.map(replacer);
  }
  return replacer(record);
};
