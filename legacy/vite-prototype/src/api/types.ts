import type {
  CreditClaim,
  CreditOffer,
  Entry,
  JudgingDecision,
  JudgingItem,
  PeerReview,
  Role,
  Season,
  StageSubmission,
  SubmittableStage,
  TickerItem,
  User,
  WeeklyMetric,
} from '@/types';

export interface SignInInput {
  email: string;
  password: string;
  /** 목 인증 전용: 어떤 역할로 로그인할지 */
  as?: Exclude<Role, 'GUEST'>;
}

export interface SignUpInput {
  email: string;
  password: string;
  code: string;
}

export interface CreateEntryInput {
  teamName: string;
  serviceName: string;
  tagline: string;
  problem: string;
  targetCustomer: string;
  memberEmails: string[];
}

export interface SubmitStageInput {
  entryId: string;
  stage: SubmittableStage;
  landingUrl: string;
  visitors: number;
  signups: number;
  researchSummary: string;
  evidenceFileName?: string;
}

/**
 * 프론트엔드가 의존하는 유일한 데이터 접근 계약.
 * 현재는 목 구현(mockApi)이 주입되고, 백엔드가 생기면 같은 시그니처의 HTTP 구현으로 교체한다.
 */
export interface ProovitApi {
  /* 시즌 */
  listSeasons(): Promise<Season[]>;
  getSeason(seasonId: string): Promise<Season>;
  advanceStage(seasonId: string): Promise<Season>;
  closeRecruiting(seasonId: string): Promise<Season>;

  /* 참가작 */
  listEntries(seasonId: string): Promise<Entry[]>;
  getEntry(entryId: string): Promise<Entry | null>;
  createEntry(seasonId: string, input: CreateEntryInput): Promise<Entry>;

  /* 인증 */
  signIn(input: SignInInput): Promise<User>;
  signUp(input: SignUpInput): Promise<User>;
  sendVerificationCode(email: string): Promise<{ sent: true }>;
  preRegister(email: string): Promise<{ ok: true }>;

  /* 제출 */
  listSubmissions(entryId: string): Promise<StageSubmission[]>;
  submitStage(input: SubmitStageInput): Promise<StageSubmission>;

  /* 지표 */
  listWeeklyMetrics(seasonId: string): Promise<WeeklyMetric[]>;
  confirmMetric(metricId: string): Promise<WeeklyMetric>;
  requestRawEvidence(metricId: string): Promise<{ requested: true }>;

  /* 크레딧 */
  listCreditOffers(seasonId: string): Promise<CreditOffer[]>;
  claimCredit(offerId: string, entryId: string): Promise<CreditClaim>;

  /* 상호 테스터 */
  listPeerReviews(entryId: string): Promise<PeerReview[]>;

  /* 심사 콘솔 */
  listJudgingItems(seasonId: string): Promise<JudgingItem[]>;
  decideJudging(
    itemId: string,
    decision: JudgingDecision,
    note?: string,
  ): Promise<JudgingItem>;

  /* 전광판 */
  listTicker(seasonId: string): Promise<TickerItem[]>;
}
