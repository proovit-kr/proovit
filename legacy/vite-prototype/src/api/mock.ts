import {
  ADMIN_USER,
  CREDIT_CODE,
  CREDIT_OFFERS,
  ENTRIES,
  JUDGING_ITEMS,
  PARTICIPANT_USER,
  PEER_REVIEWS,
  SEASONS,
  SUBMISSIONS,
  TICKER_ITEMS,
  WEEKLY_METRICS,
} from '@/mocks';
import type {
  CreditClaim,
  Entry,
  JudgingDecision,
  JudgingItem,
  Season,
  StageKey,
  StageSubmission,
  User,
  WeeklyMetric,
} from '@/types';
import type {
  CreateEntryInput,
  ProovitApi,
  SignInInput,
  SignUpInput,
  SubmitStageInput,
} from './types';

/** 목 지연 — 실제 네트워크처럼 비동기 흐름을 유지하기 위한 최소 딜레이 */
const delay = <T,>(value: T, ms = 120): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** 목 구현은 메모리 상태를 들고 있는다 (새로고침하면 초기화) */
const db = {
  seasons: clone(SEASONS),
  entries: clone(ENTRIES),
  submissions: clone(SUBMISSIONS),
  metrics: clone(WEEKLY_METRICS),
  offers: clone(CREDIT_OFFERS),
  claims: [] as CreditClaim[],
  peerReviews: clone(PEER_REVIEWS),
  judging: clone(JUDGING_ITEMS),
};

const STAGE_ORDER: StageKey[] = ['S1', 'REVIEW1', 'S2', 'S3', 'FINAL'];

function findSeason(seasonId: string): Season {
  const season = db.seasons.find((s) => s.id === seasonId);
  if (!season) throw new Error(`시즌을 찾을 수 없어요: ${seasonId}`);
  return season;
}

export const mockApi: ProovitApi = {
  /* 시즌 */
  listSeasons: () => delay(clone(db.seasons)),

  getSeason: (seasonId) => delay(clone(findSeason(seasonId))),

  advanceStage: (seasonId) => {
    const season = findSeason(seasonId);
    const idx = STAGE_ORDER.indexOf(season.currentStage);
    season.currentStage = STAGE_ORDER[Math.min(idx + 1, STAGE_ORDER.length - 1)];
    season.status = 'IN_PROGRESS';
    return delay(clone(season));
  },

  closeRecruiting: (seasonId) => {
    const season = findSeason(seasonId);
    season.status = 'IN_PROGRESS';
    return delay(clone(season));
  },

  /* 참가작 */
  listEntries: (seasonId) =>
    delay(clone(db.entries.filter((e) => e.seasonId === seasonId))),

  getEntry: (entryId) => delay(clone(db.entries.find((e) => e.id === entryId) ?? null)),

  createEntry: (seasonId, input: CreateEntryInput) => {
    const entry: Entry = {
      id: `entry-${db.entries.length + 1}`,
      seasonId,
      serviceName: input.serviceName,
      teamName: input.teamName,
      tagline: input.tagline,
      problem: input.problem,
      targetCustomer: input.targetCustomer,
      serviceUrl: '',
      ownerEmail: PARTICIPANT_USER.email,
      memberEmails: input.memberEmails,
      rank: db.entries.length + 1,
      validUsers: 0,
      weeklyDeltaPct: 0,
      retentionPct: 0,
      hasRevenue: false,
      verification: 'NONE',
      spark: [14, 14, 14, 14, 14, 14, 14],
      avatarText: input.teamName.slice(0, 1),
      passedFirstReview: false,
      createdAt: new Date().toISOString(),
    };
    db.entries.push(entry);
    return delay(clone(entry));
  },

  /* 인증 */
  signIn: ({ email, as }: SignInInput) => {
    const user: User =
      as === 'ADMIN' || email.startsWith('ops')
        ? { ...ADMIN_USER, email: email || ADMIN_USER.email }
        : { ...PARTICIPANT_USER, email: email || PARTICIPANT_USER.email };
    return delay(user);
  },

  signUp: ({ email }: SignUpInput) =>
    delay<User>({
      ...PARTICIPANT_USER,
      id: 'user-new',
      email,
      displayName: email.split('@')[0],
      entryId: null,
    }),

  sendVerificationCode: () => delay({ sent: true } as const),

  preRegister: () => delay({ ok: true } as const),

  /* 제출 */
  listSubmissions: (entryId) =>
    delay(clone(db.submissions.filter((s) => s.entryId === entryId))),

  submitStage: (input: SubmitStageInput) => {
    const found = db.submissions.find(
      (s) => s.entryId === input.entryId && s.stage === input.stage,
    );
    const conversionPct =
      input.visitors > 0 ? Number(((input.signups / input.visitors) * 100).toFixed(1)) : 0;
    const next: StageSubmission = {
      ...(found ?? {
        id: `sub-${input.stage.toLowerCase()}`,
        seasonId: 'season-1',
        entryId: input.entryId,
        stage: input.stage,
        title: input.stage,
        requirement: '',
        dueAt: new Date().toISOString(),
        dueLabel: '',
        status: 'NOT_SUBMITTED',
      }),
      status: 'SUBMITTED',
      landingUrl: input.landingUrl,
      visitors: input.visitors,
      signups: input.signups,
      conversionPct,
      researchSummary: input.researchSummary,
      evidenceFileName: input.evidenceFileName,
      submittedAt: new Date().toISOString(),
    };
    if (found) Object.assign(found, next);
    else db.submissions.push(next);
    return delay(clone(next));
  },

  /* 지표 */
  listWeeklyMetrics: (seasonId) =>
    delay(clone(db.metrics.filter((m) => m.seasonId === seasonId))),

  confirmMetric: (metricId) => {
    const metric = db.metrics.find((m) => m.id === metricId);
    if (!metric) throw new Error(`지표를 찾을 수 없어요: ${metricId}`);
    metric.status = 'CONFIRMED';
    return delay(clone(metric) as WeeklyMetric);
  },

  requestRawEvidence: () => delay({ requested: true } as const),

  /* 크레딧 */
  listCreditOffers: (seasonId) =>
    delay(clone(db.offers.filter((o) => o.seasonId === seasonId))),

  claimCredit: (offerId, entryId) => {
    const existing = db.claims.find(
      (c) => c.offerId === offerId && c.entryId === entryId,
    );
    if (existing) return delay(clone(existing));
    const claim: CreditClaim = {
      id: `claim-${db.claims.length + 1}`,
      offerId,
      entryId,
      code: CREDIT_CODE,
      claimedAt: new Date().toISOString(),
    };
    db.claims.push(claim);
    return delay(clone(claim));
  },

  /* 상호 테스터 */
  listPeerReviews: (entryId) =>
    delay(
      clone(
        db.peerReviews.filter(
          (r) => r.fromEntryId === entryId || r.toEntryId === entryId,
        ),
      ),
    ),

  /* 심사 콘솔 */
  listJudgingItems: () => delay(clone(db.judging)),

  decideJudging: (itemId, decision: JudgingDecision, note?: string) => {
    const item = db.judging.find((i) => i.id === itemId);
    if (!item) throw new Error(`심사 항목을 찾을 수 없어요: ${itemId}`);
    item.decision = decision;
    if (note) item.aiReport = [...item.aiReport];
    return delay(clone(item) as JudgingItem);
  },

  /* 전광판 */
  listTicker: () => delay(clone(TICKER_ITEMS)),
};
