import { describe, it, expect } from 'vitest';
import { buildChatbotMetadataFilter } from '../metadata-filter';

describe('buildChatbotMetadataFilter', () => {
  const orgId = '123e4567-e89b-12d3-a456-426614174000';

  it('restricts to org-wide accessible_by when selectedFileIds is empty', () => {
    const filter = buildChatbotMetadataFilter(orgId, []);

    expect(filter.must).toHaveLength(2);
    expect(filter.must[0]).toEqual({
      key: 'metadata.organization_id',
      match: { value: orgId },
    });
    expect(filter.must[1]).toEqual({
      key: 'metadata.accessible_by',
      match_any: { values: [`org:${orgId}`] },
    });
  });

  it('does not expose privately-shared files when selectedFileIds is empty', () => {
    const filter = buildChatbotMetadataFilter(orgId, []);

    const accessibleBy = filter.must.find(
      (c) => c.key === 'metadata.accessible_by',
    );
    expect(accessibleBy).toBeDefined();

    if (accessibleBy && 'match_any' in accessibleBy) {
      const values = accessibleBy.match_any.values;
      expect(values).toEqual([`org:${orgId}`]);
      expect(values.some((v) => v.startsWith('user:'))).toBe(false);
      expect(values.some((v) => v.startsWith('team:'))).toBe(false);
    }
  });

  it('filters by file_id when selectedFileIds is provided', () => {
    const fileIds = ['file-1', 'file-2', 'file-3'];
    const filter = buildChatbotMetadataFilter(orgId, fileIds);

    expect(filter.must).toHaveLength(2);
    expect(filter.must[0]).toEqual({
      key: 'metadata.organization_id',
      match: { value: orgId },
    });
    expect(filter.must[1]).toEqual({
      key: 'metadata.file_id',
      match_any: { values: fileIds },
    });
  });

  it('does not fall back to accessible_by when files are explicitly selected', () => {
    const filter = buildChatbotMetadataFilter(orgId, ['file-1']);

    expect(filter.must.some((c) => c.key === 'metadata.accessible_by')).toBe(
      false,
    );
  });

  it('always enforces organization_id as the first condition', () => {
    const empty = buildChatbotMetadataFilter(orgId, []);
    const withFiles = buildChatbotMetadataFilter(orgId, ['f-1']);

    expect(empty.must[0].key).toBe('metadata.organization_id');
    expect(withFiles.must[0].key).toBe('metadata.organization_id');
  });

  it('copies selectedFileIds to avoid mutating caller input', () => {
    const fileIds = ['file-1'];
    const filter = buildChatbotMetadataFilter(orgId, fileIds);

    const condition = filter.must[1];
    if (condition && 'match_any' in condition) {
      expect(condition.match_any.values).not.toBe(fileIds);
      expect(condition.match_any.values).toEqual(fileIds);
    }
  });
});
