/**
 * PROOVIT 도메인 타입.
 * 백엔드가 붙을 때 이 파일이 계약(contract)의 기준이 된다.
 */

export type Role = 'GUEST' | 'PARTICIPANT' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  entryId: string | null; // 참가팀이 있으면 해당 Entry id
}

/** 모집 전 / 모집 중 / 진행 중 / 종료 */
export type SeasonStatus = 'UPCOMING' | 'RECRUITING' | 'IN_PROGRESS' | 'ENDED';

/** 시즌의 5개 체크포인트 */
export type StageKey = 'S1' | 'REVIEW1' | 'S2' | 'S3' | 'FINAL';

/** 제출물이 있는 스테이지 (라우트 /dashboard/submissions/:stage) */
export type SubmittableStage = Extract<StageKey, 'S1' | 'S2' | 'S3'>;

export interface SeasonStage {
  key: StageKey;
  n: number;
  /** 수요 검증 / 1차 심사 / AI 빌드 / 유저 확보 레이스 / 최종 심사 */
  label: string;
  /** 1주, 2주, 3~4주 … */
  week: string;
  /** 8/3 ~ 8/9 */
  range: string;
  description: string;
  /** 해당 스테이지 제출 마감 (제출이 있는 스테이지만) */
  dueAt?: string;
}

export interface Season {
  id: string;
  number: number;
  title: string;
  theme: string;
  status: SeasonStatus;
  /** 현재 진행 중인 스테이지 */
  currentStage: StageKey;
  stages: SeasonStage[];
  /** 모집 마감 시각 (ISO) */
  applyCloseAt: string;
  /** 킥오프 시각 (ISO) — 랜딩 D-day */
  kickoffAt: string;
  /** 시즌 종료 시각 (ISO) */
  endAt: string;
  prizePoolKRW: number;
  entryFeeKRW: number;
  teamSizeLabel: string;
  recruitLabel: string;
  preRegisterCount: number;
  teamCount: number;
  survivingTeamCount: number;
  /** 리더보드 갱신 안내 문구 */
  refreshNotice: string;
}

export type VerificationStatus = 'VERIFIED' | 'PENDING' | 'NONE';

export interface Entry {
  id: string;
  seasonId: string;
  /** 서비스명 (예: 빵집레이더) */
  serviceName: string;
  /** 팀명 (예: 새벽로켓) */
  teamName: string;
  tagline: string;
  problem: string;
  targetCustomer: string;
  serviceUrl: string;
  ownerEmail: string;
  memberEmails: string[];
  rank: number;
  /** 유효 가입자 수 */
  validUsers: number;
  /** 주간 증가율 (%) */
  weeklyDeltaPct: number;
  /** 재방문율 (%) */
  retentionPct: number;
  hasRevenue: boolean;
  verification: VerificationStatus;
  /** 스파크라인용 값 (작을수록 위 = SVG y좌표 기준으로 변환) */
  spark: number[];
  /** 아바타 1글자 */
  avatarText: string;
  passedFirstReview: boolean;
  createdAt: string;
}

export type SubmissionStatus =
  | 'LOCKED'
  | 'NOT_SUBMITTED'
  | 'SUBMITTED'
  | 'PASSED'
  | 'HELD';

export interface StageSubmission {
  id: string;
  seasonId: string;
  entryId: string;
  stage: SubmittableStage;
  title: string;
  requirement: string;
  status: SubmissionStatus;
  dueAt: string;
  dueLabel: string;
  landingUrl?: string;
  visitors?: number;
  signups?: number;
  /** 방문자·신청자로 자동 계산 */
  conversionPct?: number;
  researchSummary?: string;
  evidenceFileName?: string;
  submittedAt?: string;
  reviewerNote?: string;
}

export type MetricStatus = 'PENDING' | 'CONFIRMED';

export interface WeeklyMetric {
  id: string;
  seasonId: string;
  entryId: string;
  /** W5 */
  week: string;
  validUsers: number;
  deltaPct: number;
  evidenceName: string;
  status: MetricStatus;
}

export type CreditOfferStatus = 'AVAILABLE' | 'LOCKED' | 'NEGOTIATING';
export type CreditKind = 'BUILDER' | 'API' | 'HOSTING';

export interface CreditOffer {
  id: string;
  seasonId: string;
  kind: CreditKind;
  title: string;
  description: string;
  status: CreditOfferStatus;
  /** 잠금 해제 조건 문구 */
  unlockHint?: string;
}

export interface CreditClaim {
  id: string;
  offerId: string;
  entryId: string;
  code: string;
  claimedAt: string;
}

export type PeerReviewStatus = 'ASSIGNED' | 'DONE';

export interface PeerReview {
  id: string;
  seasonId: string;
  week: string;
  fromEntryId: string;
  toEntryId: string;
  status: PeerReviewStatus;
  content?: string;
  createdAt?: string;
}

/** 운영자 심사 콘솔의 큐 아이템 */
export type JudgingDecision = 'PENDING' | 'PASSED' | 'HELD';

export interface JudgingItem {
  id: string;
  entryId: string;
  teamName: string;
  serviceName: string;
  stage: SubmittableStage;
  decision: JudgingDecision;
  signups: number;
  visitors: number;
  conversionPct: number;
  evidenceName: string;
  aiReport: string[];
  aiScore: number;
}

/** 전광판 티커 아이템 */
export interface TickerItem {
  id: string;
  text: string;
  highlight: string;
  tone: 'lime' | 'gold';
}
