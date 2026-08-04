import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/api';
import type { CreateEntryInput, SubmitStageInput } from '@/api';
import { ADMIN_USER, MY_ENTRY_ID, PARTICIPANT_USER, SEASON_1 } from '@/mocks';
import type {
  CreditClaim,
  CreditOffer,
  Entry,
  JudgingDecision,
  JudgingItem,
  PeerReview,
  Season,
  SeasonStatus,
  StageKey,
  StageSubmission,
  TickerItem,
  User,
  WeeklyMetric,
} from '@/types';

/** 개발 툴바에서 고르는 목 역할 */
export type DevRole = 'GUEST' | 'PARTICIPANT_NO_ENTRY' | 'PARTICIPANT' | 'ADMIN';

interface AppState {
  ready: boolean;
  user: User | null;
  season: Season;
  entries: Entry[];
  submissions: StageSubmission[];
  offers: CreditOffer[];
  claims: CreditClaim[];
  peerReviews: PeerReview[];
  metrics: WeeklyMetric[];
  judging: JudgingItem[];
  ticker: TickerItem[];
  /** 1차 심사 통과 여부 (개발 툴바 토글) */
  passedFirstReview: boolean;
  /** 개발 툴바로 덮어쓴 시즌 상태 — 새로고침해도 유지된다 */
  seasonOverride: { status?: SeasonStatus; currentStage?: StageKey } | null;

  bootstrap: () => Promise<void>;

  /* 인증 */
  signIn: (email: string, password: string, as?: 'PARTICIPANT' | 'ADMIN') => Promise<User>;
  signUp: (email: string, password: string, code: string) => Promise<User>;
  signOut: () => void;

  /* 개발 툴바 */
  setDevRole: (role: DevRole) => void;
  setSeasonStatus: (status: SeasonStatus) => void;
  setCurrentStage: (stage: StageKey) => void;
  setPassedFirstReview: (passed: boolean) => void;

  /* 도메인 액션 */
  createEntry: (input: CreateEntryInput) => Promise<Entry>;
  submitStage: (input: SubmitStageInput) => Promise<StageSubmission>;
  claimCredit: (offerId: string) => Promise<CreditClaim>;
  confirmMetric: (metricId: string) => Promise<void>;
  decideJudging: (itemId: string, decision: JudgingDecision, note?: string) => Promise<void>;
  advanceStage: () => Promise<void>;
  closeRecruiting: () => Promise<void>;
}

export const devRoleOf = (user: User | null): DevRole => {
  if (!user) return 'GUEST';
  if (user.role === 'ADMIN') return 'ADMIN';
  return user.entryId ? 'PARTICIPANT' : 'PARTICIPANT_NO_ENTRY';
};

export const useAppStore = create<AppState>()(
  persist<AppState>(
    (set, get) => ({
  ready: false,
  user: null,
  season: SEASON_1,
  entries: [],
  submissions: [],
  offers: [],
  claims: [],
  peerReviews: [],
  metrics: [],
  judging: [],
  ticker: [],
  passedFirstReview: false,
  seasonOverride: null,

  bootstrap: async () => {
    const base = await api.getSeason(SEASON_1.id);
    // 개발 툴바로 바꿔둔 시즌 상태를 다시 얹는다
    const season = { ...base, ...(get().seasonOverride ?? {}) };
    const [entries, submissions, offers, peerReviews, metrics, judging, ticker] =
      await Promise.all([
        api.listEntries(season.id),
        api.listSubmissions(MY_ENTRY_ID),
        api.listCreditOffers(season.id),
        api.listPeerReviews(MY_ENTRY_ID),
        api.listWeeklyMetrics(season.id),
        api.listJudgingItems(season.id),
        api.listTicker(season.id),
      ]);
    set({
      ready: true,
      season,
      entries,
      submissions,
      offers,
      peerReviews,
      metrics,
      judging,
      ticker,
    });
  },

  signIn: async (email, password, as) => {
    const user = await api.signIn({ email, password, as });
    set({ user });
    return user;
  },

  signUp: async (email, password, code) => {
    const user = await api.signUp({ email, password, code });
    set({ user });
    return user;
  },

  signOut: () => set({ user: null }),

  setDevRole: (role) => {
    if (role === 'GUEST') return set({ user: null });
    if (role === 'ADMIN') return set({ user: { ...ADMIN_USER } });
    if (role === 'PARTICIPANT') return set({ user: { ...PARTICIPANT_USER } });
    return set({
      user: { ...PARTICIPANT_USER, id: 'user-no-entry', displayName: '내 계정', entryId: null },
    });
  },

  setSeasonStatus: (status) =>
    set({
      season: { ...get().season, status },
      seasonOverride: { ...(get().seasonOverride ?? {}), status },
    }),

  setCurrentStage: (stage) =>
    set({
      season: { ...get().season, currentStage: stage },
      seasonOverride: { ...(get().seasonOverride ?? {}), currentStage: stage },
    }),

  setPassedFirstReview: (passed) => set({ passedFirstReview: passed }),

  createEntry: async (input) => {
    const entry = await api.createEntry(get().season.id, input);
    set((s) => ({
      entries: [...s.entries, entry],
      user: s.user ? { ...s.user, entryId: MY_ENTRY_ID, displayName: `팀 ${entry.teamName}` } : s.user,
    }));
    return entry;
  },

  submitStage: async (input) => {
    const submission = await api.submitStage(input);
    set((s) => ({
      submissions: s.submissions.map((item) =>
        item.stage === submission.stage ? submission : item,
      ),
    }));
    return submission;
  },

  claimCredit: async (offerId) => {
    const entryId = get().user?.entryId ?? MY_ENTRY_ID;
    const claim = await api.claimCredit(offerId, entryId);
    set((s) => ({
      claims: s.claims.some((c) => c.id === claim.id) ? s.claims : [...s.claims, claim],
    }));
    return claim;
  },

  confirmMetric: async (metricId) => {
    const metric = await api.confirmMetric(metricId);
    set((s) => ({ metrics: s.metrics.map((m) => (m.id === metric.id ? metric : m)) }));
  },

  decideJudging: async (itemId, decision, note) => {
    const item = await api.decideJudging(itemId, decision, note);
    set((s) => ({ judging: s.judging.map((i) => (i.id === item.id ? item : i)) }));
  },

  advanceStage: async () => {
    const season = await api.advanceStage(get().season.id);
    set({
      season,
      seasonOverride: { status: season.status, currentStage: season.currentStage },
    });
  },

  closeRecruiting: async () => {
    const season = await api.closeRecruiting(get().season.id);
    set({
      season,
      seasonOverride: { status: season.status, currentStage: season.currentStage },
    });
  },
    }),
    {
      name: 'proovit-dev-state',
      // 목 세션과 개발 툴바 상태만 저장한다 (새로고침·딥링크 대응)
      partialize: (state) =>
        ({
          user: state.user,
          passedFirstReview: state.passedFirstReview,
          seasonOverride: state.seasonOverride,
        }) as unknown as AppState,
    },
  ),
);
