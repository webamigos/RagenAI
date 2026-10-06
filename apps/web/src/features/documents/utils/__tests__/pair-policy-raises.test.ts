import { describe, expect, it } from 'vitest';
import { pairPolicyRaises } from '../knowledge-list-issues';
import type { UserFileType } from '../../contracts/document.types';

const file = (
  id: string,
  piiPolicy: 'NONE' | 'TOXIC_ONLY' | 'STRICT',
  pairedWith?: { id: string; piiPolicy: 'NONE' | 'TOXIC_ONLY' | 'STRICT' },
): UserFileType => ({
  id,
  organizationId: 'org',
  fileName: `${id}.pdf`,
  fileSize: 1,
  fileType: 'PDF',
  projectId: null,
  project: null,
  piiPolicy,
  pairedWith: pairedWith
    ? { ...pairedWith, fileName: `${pairedWith.id}.pdf`, language: 'eng' }
    : null,
});

describe('pairPolicyRaises', () => {
  it('names the weaker file and the stricter policy, never a lower one', () => {
    expect(
      pairPolicyRaises([
        file('a', 'TOXIC_ONLY', { id: 'b', piiPolicy: 'STRICT' }),
      ]),
    ).toEqual([{ fileId: 'a', raiseTo: 'STRICT' }]);
    expect(
      pairPolicyRaises([file('a', 'STRICT', { id: 'b', piiPolicy: 'NONE' })]),
    ).toEqual([{ fileId: 'b', raiseTo: 'STRICT' }]);
  });

  it('lists a pair once when both files are on the page', () => {
    expect(
      pairPolicyRaises([
        file('a', 'NONE', { id: 'b', piiPolicy: 'STRICT' }),
        file('b', 'STRICT', { id: 'a', piiPolicy: 'NONE' }),
      ]),
    ).toEqual([{ fileId: 'a', raiseTo: 'STRICT' }]);
  });

  it('ignores consistent pairs, unpaired files and files with no policy', () => {
    expect(
      pairPolicyRaises([
        file('a', 'STRICT', { id: 'b', piiPolicy: 'STRICT' }),
        file('c', 'NONE'),
      ]),
    ).toEqual([]);
  });
});
