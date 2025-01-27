/**
 * This function renames `public_id` field to `id`
 * It's important from our perspective to share only public_id value but
 * from DX developers prefer to use id field instead of public id
 * So this function makes:
 * 1. renames object property public_id to id
 * 2. to it recursively
 *
 * @param collection
 * @returns
 */
export const replaceIds = <T>(collection: T[]) => {
  const replacer = (elem: any): any => {
    if (Array.isArray(elem)) {
      return elem.map(replacer);
    } else if (elem && typeof elem === 'object') {
      const { public_id, ...doc } = elem;
      const normalizedDoc = {
        id: public_id,
        ...doc,
      };

      // Recursively normalize nested objects
      Object.keys(normalizedDoc).forEach((key) => {
        normalizedDoc[key] = replacer(normalizedDoc[key]);
      });
      return normalizedDoc;
    }
    return elem; // Return unchanged if not an object or array
  };

  return collection.map(replacer);
};
