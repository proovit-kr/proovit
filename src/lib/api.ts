/*
  API 응답 봉투 — API 명세서 v0.2 §0.2·§0.3.

  모든 Route Handler가 이 함수들로만 응답한다. 직접 Response.json을 부르지 않는다.
  봉투를 강제하는 이유는 클라이언트가 성공·실패를 **본문 모양이 아니라 ok 하나로**
  가리게 하기 위해서다. 지금처럼 성공은 `{ok:true, seasonSlug}`, 실패는
  `{error, message}`로 모양이 갈리면 화면마다 분기가 달라지고, 새 필드를 더할 때
  그 분기를 전부 다시 봐야 한다.

  베이스 경로는 `/api/v1`이다. 버전을 붙이는 이유는 참가작 쪽에서 우리 API를 부를
  일이 생겼을 때(측정 토큰·리더보드 임베드) 깨지 않고 갈아탈 자리가 필요해서다.

  ⚠️ Auth.js(`/api/auth/[...nextauth]`)만 v1 밖에 남는다. 우리가 만든 API가 아니라
  라이브러리가 정한 경로이고, 옮기면 구글 콘솔 콜백 2개(로컬·운영) 재등록이 따라온다.
*/

/** 성공·실패를 가르는 유일한 값. 클라이언트는 이것만 본다. */
export type ApiEnvelope<T> =
  | { ok: true; data: T; meta?: ApiMeta }
  | { ok: false; error: ApiError };

export type ApiMeta = {
  /** 커서 페이징 — 목록 일반 */
  cursor?: string | null;
  hasMore?: boolean;
  /** 랭크 페이징 — 리더보드처럼 순위 번호가 필요한 곳 */
  page?: number;
  size?: number;
  total?: number;
};

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

/*
  에러 코드와 HTTP 상태를 한 곳에 묶는다. 핸들러가 상태 코드를 직접 고르면
  같은 뜻에 다른 숫자가 붙는다 — 06 §5.2와 CLAUDE.md §3이 고정한 규약이다.

  404를 "없음"과 "플래그 off"에 함께 쓰는 것이 핵심이다. 403은 "있는데 못 본다"라
  시즌1에서 쓰지 않는 기능의 존재 자체를 노출한다.
*/
export const API_ERROR_STATUS = {
  /** 미로그인 */
  UNAUTHENTICATED: 401,
  /** 로그인했으나 권한 없음 — 타 팀 리소스·롤 부족 */
  FORBIDDEN: 403,
  /** 리소스 없음 **또는** feature_flag off */
  NOT_FOUND: 404,
  /** 권한은 있으나 지금 스테이지에서는 불가 */
  STAGE_LOCKED: 409,
  /** entry.status가 active가 아닌 상태에서의 쓰기 */
  ENTRY_INACTIVE: 409,
  /** 멱등키 중복(웹훅 재전송 등) */
  DUPLICATE: 409,
  /** 열린 시즌이 없다 — 사전신청·참가신청의 전제가 없는 상태 */
  NO_OPEN_SEASON: 409,
  /** 페이로드 검증 실패(Zod) */
  VALIDATION_FAILED: 422,
  /** 본문이 JSON이 아니다 */
  INVALID_JSON: 400,
  /** 레이트리밋 초과 */
  RATE_LIMITED: 429,
  /** 봇 판정 */
  BOT_CHECK_FAILED: 403,
  /** 우리 설정 오류 — 사용자가 무엇을 해도 통과할 수 없다 */
  BOT_CHECK_MISCONFIGURED: 500,
  /** 서버 오류 */
  INTERNAL: 500,
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_STATUS;

/** 성공 응답. `init`으로 상태 코드·헤더를 덮어쓴다(생성은 201 등). */
export function apiOk<T>(
  data: T,
  init?: { status?: number; headers?: HeadersInit; meta?: ApiMeta },
): Response {
  const body: ApiEnvelope<T> = init?.meta
    ? { ok: true, data, meta: init.meta }
    : { ok: true, data };

  return Response.json(body, {
    status: init?.status ?? 200,
    headers: init?.headers,
  });
}

/**
 * 실패 응답. 상태 코드는 코드에서 끌어오므로 핸들러가 고르지 않는다.
 * `message`는 **사용자에게 그대로 보여줄 문장**이다 — 내부 사정을 적지 않는다.
 */
export function apiFail(
  code: ApiErrorCode,
  message: string,
  init?: { details?: Record<string, unknown>; headers?: HeadersInit },
): Response {
  const error: ApiError = init?.details
    ? { code, message, details: init.details }
    : { code, message };

  return Response.json(
    { ok: false, error } satisfies ApiEnvelope<never>,
    { status: API_ERROR_STATUS[code], headers: init?.headers },
  );
}

/**
 * 스테이지 게이트 전용. 409 응답의 `details` 모양이 명세서 §0.7에 고정돼 있다 —
 * 화면이 "지금은 왜 안 되는지"를 그리려면 현재·필요 스테이지가 함께 와야 한다.
 */
export function apiStageLocked(
  message: string,
  details: {
    currentStage: string | null;
    requiredStage: string | null;
    availableAt?: string | null;
  },
): Response {
  return apiFail("STAGE_LOCKED", message, {
    details: { availableAt: null, ...details },
  });
}
