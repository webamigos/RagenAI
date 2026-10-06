import type { KnowledgeFindingType } from '../contracts/brain.types';
import { dbUuid } from '../contracts/brain-review.types';

export type PageFilters = {
  owner?: 'none';
  published?: boolean;
  file?: string;
};
type Parameter = string | string[] | undefined;
export function parsePageFilters(params: {
  owner?: Parameter;
  published?: Parameter;
  file?: Parameter;
}): PageFilters {
  const first = (value: Parameter) => (Array.isArray(value) ? value[0] : value);
  const owner = first(params.owner);
  const published = first(params.published);
  const file = first(params.file);
  return {
    ...(owner === 'none' ? { owner } : {}),
    ...(published === 'true' || published === 'false'
      ? { published: published === 'true' }
      : {}),
    ...(file && dbUuid.safeParse(file).success ? { file } : {}),
  };
}
export function withPageFilters(href: string, filters: PageFilters): string {
  const [rest, hash] = href.split('#');
  const [path, query] = rest!.split('?');
  const params = new URLSearchParams(query);
  if (filters.owner) {
    params.set('owner', filters.owner);
  }
  if (filters.published !== undefined) {
    params.set('published', String(filters.published));
  }
  if (filters.file) {
    params.set('file', filters.file);
  }
  return `${params.size ? `${path}?${params}` : path}${hash === undefined ? '' : `#${hash}`}`;
}

export function withFindingType(
  href: string,
  type: KnowledgeFindingType | undefined,
): string {
  if (!type) {
    return href;
  }
  const [rest, hash] = href.split('#');
  const [path, query] = rest!.split('?');
  const params = new URLSearchParams(query);
  params.set('type', type);
  return `${path}?${params}${hash === undefined ? '' : `#${hash}`}`;
}
