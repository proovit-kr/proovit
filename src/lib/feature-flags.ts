import { z } from "zod";

/*
  시즌별 화면 on/off — 06 §4.4 · PLN3 화면정의서 2장 카탈로그.

  `seasons.feature_flags`는 JSONB다. 컬럼이 아니라 JSON인 이유는 시즌마다 켜는
  화면이 다르고, 시즌2에 항목이 늘 때 마이그레이션을 돌리고 싶지 않아서다.

  ⚠️ **읽는 모든 지점에서 Zod로 검증한다**(CLAUDE.md 스키마 주석).
  JSONB는 어떤 모양이든 들어가므로 오타 하나가 런타임까지 살아서 간다.
  `featureFlags.leaderbord`(오타)는 undefined가 되고, falsy라 화면이 조용히 꺼진다.
  파싱을 한 곳으로 모으면 그 사고가 이 파일 안에서 끝난다.

  기본값을 전부 false로 두지 않는 이유: 새 플래그를 추가했을 때 기존 시즌 행에
  그 키가 없다. 그때 "명시하지 않았으면 꺼짐"이 안전한 것과 "리더보드처럼
  없으면 서비스가 성립하지 않는 것"이 갈린다 — 아래 기본값이 그 구분이다.
*/
export const featureFlagsSchema = z.object({
  /** 공개 리더보드. 서비스의 얼굴이라 기본 켜짐 */
  leaderboard: z.boolean().default(true),
  /** 인앱 알림센터 */
  notifications: z.boolean().default(true),
  /** 완주 보증금. 시즌1 도입 여부 미정(PLN3 2장 ⚠️) */
  deposit: z.boolean().default(false),
  /**
   * 상호 테스터 배정·피드백.
   * ⚠️ 시즌1 사용 여부가 상충 상태다 — 운영규칙 제14조는 시즌1 의무로 정하는데
   * 옛 요구사항 정리본은 미사용으로 적혀 있다(PLN1 미결 1번 · PLN3 미결 3번).
   * 8/17에 켜기로 나오면 이 기본값만 바꾸면 화면이 열린다.
   */
  testerAssignments: z.boolean().default(false),
  /** 스폰서 크레딧 발급. 스폰서 협의 대기(P1) */
  credits: z.boolean().default(false),
  /** 스폰서·코드 배치 관리 콘솔(P2) */
  sponsors: z.boolean().default(false),
  /** 지난 시즌 아카이브. 시즌2부터 의미가 생긴다(P2) */
  archive: z.boolean().default(false),
});

export type FeatureFlags = z.infer<typeof featureFlagsSchema>;
export type FeatureFlagKey = keyof FeatureFlags;

/**
 * JSONB → 검증된 플래그.
 *
 * 파싱에 실패해도 던지지 않는다. 플래그 하나가 깨졌다고 시즌 전체가 500이 되면
 * 관전 트래픽까지 같이 죽는다. 대신 기본값으로 떨어뜨리고 로그를 남긴다 —
 * 화면이 조금 덜 열리는 것이 페이지가 안 뜨는 것보다 낫다.
 */
export function parseFeatureFlags(raw: unknown): FeatureFlags {
  const parsed = featureFlagsSchema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;

  console.error(
    "[feature-flags] seasons.feature_flags 파싱 실패 — 기본값으로 진행합니다.",
    parsed.error.issues,
  );
  return featureFlagsSchema.parse({});
}
