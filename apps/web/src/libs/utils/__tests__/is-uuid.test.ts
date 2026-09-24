import { describe, it, expect } from 'vitest';
import { isUuid } from '../is-uuid';

describe('isUuid', () => {
  it('accepts a uuid in either case', () => {
    expect(isUuid('0a5aee2a-9877-4367-8915-452d50524d87')).toBe(true);
    expect(isUuid('0A5AEE2A-9877-4367-8915-452D50524D87')).toBe(true);
  });

  it.each([
    'xyz',
    '',
    '0a5aee2a-9877-4367-8915-452d50524d8',
    ' 0a5aee2a-9877-4367-8915-452d50524d87',
    null,
    undefined,
    42,
  ])('rejects %j', (value) => {
    expect(isUuid(value)).toBe(false);
  });
});
