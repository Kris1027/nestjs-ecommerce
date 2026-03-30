import { API_PREFIX } from '../../../src/common/constants';

export function api(path: string): string {
  return `/${API_PREFIX}${path}`;
}
