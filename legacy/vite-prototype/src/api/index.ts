import { mockApi } from './mock';
import type { ProovitApi } from './types';

/**
 * 앱 전체가 쓰는 API 싱글턴.
 * 백엔드가 붙으면 이 파일에서 httpApi로 갈아끼우면 된다 (인터페이스는 ./types).
 */
export const api: ProovitApi = mockApi;

export type { ProovitApi } from './types';
export * from './types';
