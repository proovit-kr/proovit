/**
 * 전 페이지가 공유하는 목데이터.
 * 시안(design-reference)의 숫자를 그대로 옮겨 리더보드·참가작·대시보드·심사 콘솔이 서로 아귀가 맞도록 한다.
 */
import type {
  CreditClaim,
  CreditOffer,
  Entry,
  JudgingItem,
  PeerReview,
  Season,
  SeasonStage,
  StageSubmission,
  TickerItem,
  User,
  WeeklyMetric,
} from '@/types';

/* ------------------------------------------------------------------ 시즌 */

export const SEASON_STAGES: SeasonStage[] = [
  {
    key: 'S1',
    n: 1,
    label: '수요 검증',
    week: '1주',
    range: '8/3 ~ 8/9',
    description: '아이디어의 수요를 데이터로 먼저 확인해요.',
    dueAt: '2026-07-25T23:59:59+09:00',
  },
  {
    key: 'REVIEW1',
    n: 2,
    label: '1차 심사',
    week: '2주',
    range: '8/10',
    description: '검증 결과로 본선 진출 팀을 가려요.',
  },
  {
    key: 'S2',
    n: 3,
    label: 'AI 빌드',
    week: '3~4주',
    range: '8/11 ~ 8/24',
    description: 'AI 빌더로 실제 서비스를 만들어 배포해요.',
    dueAt: '2026-08-08T23:59:59+09:00',
  },
  {
    key: 'S3',
    n: 4,
    label: '유저 확보 레이스',
    week: '5~6주',
    range: '8/25 ~ 9/7',
    description: '실제 유저를 모으며 리더보드에서 경쟁해요.',
    dueAt: '2026-08-22T23:59:59+09:00',
  },
  {
    key: 'FINAL',
    n: 5,
    label: '최종 심사·시상',
    week: '6주 말',
    range: '9/8 ~ 9/10',
    description: '검증된 지표로 최종 순위와 시상이 결정돼요.',
  },
];

export const SEASON_1: Season = {
  id: 'season-1',
  number: 1,
  title: '시즌 1',
  theme: '자유 주제',
  status: 'RECRUITING',
  currentStage: 'S1',
  stages: SEASON_STAGES,
  applyCloseAt: '2026-07-27T23:59:59+09:00',
  kickoffAt: '2026-08-04T10:00:00+09:00',
  endAt: '2026-09-10T23:59:59+09:00',
  prizePoolKRW: 3_000_000,
  entryFeeKRW: 0,
  teamSizeLabel: '1~2인',
  recruitLabel: '20~40팀',
  preRegisterCount: 128,
  teamCount: 27,
  survivingTeamCount: 19,
  refreshNotice: '오늘 07:00 갱신 · 1일 1회',
};

const SEASON_0_RANGES = ['4/13 ~ 4/19', '4/20', '4/21 ~ 5/4', '5/5 ~ 5/18', '5/19 ~ 5/24'];

/** 시즌 아카이브용 (시즌 0 = 파일럿) */
export const SEASON_0: Season = {
  ...SEASON_1,
  stages: SEASON_STAGES.map((stage, i) => ({
    ...stage,
    range: SEASON_0_RANGES[i],
    dueAt: undefined,
  })),
  id: 'season-0',
  number: 0,
  title: '시즌 0 (파일럿)',
  theme: '생활 밀착형 도구',
  status: 'ENDED',
  currentStage: 'FINAL',
  applyCloseAt: '2026-04-05T23:59:59+09:00',
  kickoffAt: '2026-04-13T10:00:00+09:00',
  endAt: '2026-05-24T23:59:59+09:00',
  prizePoolKRW: 1_000_000,
  preRegisterCount: 64,
  teamCount: 12,
  survivingTeamCount: 8,
};

export const SEASONS: Season[] = [SEASON_1, SEASON_0];

/* ------------------------------------------------------------- 참가팀 */

export const ENTRIES: Entry[] = [
  {
    id: 'entry-1',
    seasonId: 'season-1',
    serviceName: '빵집레이더',
    teamName: '새벽로켓',
    tagline: '우리 동네 빵 나오는 시간 알림 서비스',
    problem: '갓 구운 빵을 사고 싶은데 언제 나오는지 알 방법이 없어요.',
    targetCustomer: '갓 구운 빵을 사고 싶은 직장인',
    serviceUrl: 'https://bbangzip-radar.example.com',
    ownerEmail: 'dawn@proovit.kr',
    memberEmails: ['rocket@proovit.kr'],
    rank: 1,
    validUsers: 412,
    weeklyDeltaPct: 38,
    retentionPct: 42,
    hasRevenue: true,
    verification: 'VERIFIED',
    spark: [15, 13, 14, 10, 11, 6, 3],
    avatarText: '빵',
    passedFirstReview: true,
    createdAt: '2026-07-21T09:00:00+09:00',
  },
  {
    id: 'entry-2',
    seasonId: 'season-1',
    serviceName: '링크줍줍',
    teamName: '북마클릿',
    tagline: '흩어진 링크를 한 곳에 모아주는 북마크 도구',
    problem: '읽으려고 저장한 링크를 다시 찾지 못해요.',
    targetCustomer: '뉴스레터를 많이 구독하는 직장인',
    serviceUrl: 'https://linkjupjup.example.com',
    ownerEmail: 'mark@proovit.kr',
    memberEmails: [],
    rank: 2,
    validUsers: 356,
    weeklyDeltaPct: 9,
    retentionPct: 31,
    hasRevenue: true,
    verification: 'VERIFIED',
    spark: [16, 14, 12, 13, 9, 7, 4],
    avatarText: '링',
    passedFirstReview: true,
    createdAt: '2026-07-21T09:10:00+09:00',
  },
  {
    id: 'entry-3',
    seasonId: 'season-1',
    serviceName: '회의록요정',
    teamName: '미닛테이커',
    tagline: '회의 녹음을 요약해 공유까지 해주는 도구',
    problem: '회의가 끝나면 무슨 얘기를 했는지 남지 않아요.',
    targetCustomer: '회의가 많은 소규모 팀',
    serviceUrl: 'https://minutes-fairy.example.com',
    ownerEmail: 'minute@proovit.kr',
    memberEmails: [],
    rank: 3,
    validUsers: 298,
    weeklyDeltaPct: 7,
    retentionPct: 28,
    hasRevenue: false,
    verification: 'VERIFIED',
    spark: [15, 14, 12, 11, 10, 8, 5],
    avatarText: '회',
    passedFirstReview: true,
    createdAt: '2026-07-21T09:20:00+09:00',
  },
  {
    id: 'entry-4',
    seasonId: 'season-1',
    serviceName: '텃밭일지',
    teamName: '초록손',
    tagline: '베란다 텃밭 물주기 기록과 알림',
    problem: '식물을 언제 돌봤는지 기억이 안 나요.',
    targetCustomer: '베란다에서 식물을 키우는 1인 가구',
    serviceUrl: 'https://garden-log.example.com',
    ownerEmail: 'green@proovit.kr',
    memberEmails: [],
    rank: 4,
    validUsers: 241,
    weeklyDeltaPct: 12,
    retentionPct: 35,
    hasRevenue: false,
    verification: 'VERIFIED',
    spark: [16, 15, 13, 12, 9, 8, 5],
    avatarText: '텃',
    passedFirstReview: true,
    createdAt: '2026-07-21T09:30:00+09:00',
  },
  {
    id: 'entry-5',
    seasonId: 'season-1',
    serviceName: '산책메이트',
    teamName: '강아지먼저',
    tagline: '동네 산책 친구를 매칭해주는 서비스',
    problem: '혼자 산책하면 금방 그만두게 돼요.',
    targetCustomer: '반려견과 매일 산책하는 사람',
    serviceUrl: 'https://walk-mate.example.com',
    ownerEmail: 'walk@proovit.kr',
    memberEmails: [],
    rank: 5,
    validUsers: 187,
    weeklyDeltaPct: -4,
    retentionPct: 18,
    hasRevenue: false,
    verification: 'PENDING',
    spark: [10, 9, 11, 10, 12, 13, 14],
    avatarText: '산',
    passedFirstReview: true,
    createdAt: '2026-07-21T09:40:00+09:00',
  },
  {
    id: 'entry-6',
    seasonId: 'season-1',
    serviceName: '레시피환산기',
    teamName: '계량컵',
    tagline: '인분과 계량 단위를 자동으로 환산',
    problem: '레시피 인분을 바꾸면 계량이 헷갈려요.',
    targetCustomer: '주말에 요리하는 자취생',
    serviceUrl: 'https://recipe-convert.example.com',
    ownerEmail: 'cup@proovit.kr',
    memberEmails: [],
    rank: 6,
    validUsers: 152,
    weeklyDeltaPct: 5,
    retentionPct: 24,
    hasRevenue: false,
    verification: 'VERIFIED',
    spark: [15, 14, 14, 12, 11, 10, 8],
    avatarText: '레',
    passedFirstReview: true,
    createdAt: '2026-07-21T09:50:00+09:00',
  },
  {
    id: 'entry-7',
    seasonId: 'season-1',
    serviceName: '중고가늠',
    teamName: '시세요정',
    tagline: '중고 거래 적정가를 알려주는 시세 도구',
    problem: '중고로 팔 때 얼마를 불러야 할지 모르겠어요.',
    targetCustomer: '중고 거래를 자주 하는 20~30대',
    serviceUrl: 'https://used-price.example.com',
    ownerEmail: 'price@proovit.kr',
    memberEmails: [],
    rank: 7,
    validUsers: 118,
    weeklyDeltaPct: 2,
    retentionPct: 21,
    hasRevenue: false,
    verification: 'PENDING',
    spark: [13, 13, 12, 12, 11, 11, 10],
    avatarText: '중',
    passedFirstReview: false,
    createdAt: '2026-07-21T10:00:00+09:00',
  },
  {
    id: 'entry-8',
    seasonId: 'season-1',
    serviceName: '모임비 정산',
    teamName: '엔빵',
    tagline: '모임 회비를 자동으로 나눠 정산',
    problem: '모임이 끝나면 정산이 늘 애매해요.',
    targetCustomer: '정기 모임을 운영하는 총무',
    serviceUrl: 'https://nbbang.example.com',
    ownerEmail: 'nbbang@proovit.kr',
    memberEmails: [],
    rank: 8,
    validUsers: 87,
    weeklyDeltaPct: -1,
    retentionPct: 15,
    hasRevenue: false,
    verification: 'VERIFIED',
    spark: [11, 10, 11, 11, 12, 12, 13],
    avatarText: '모',
    passedFirstReview: false,
    createdAt: '2026-07-21T10:10:00+09:00',
  },
];

/** 로그인한 참가자가 소속된 팀 (시안의 "팀 새벽로켓") */
export const MY_ENTRY_ID = 'entry-1';

/* ---------------------------------------------------------------- 유저 */

export const PARTICIPANT_USER: User = {
  id: 'user-participant',
  email: 'dawn@proovit.kr',
  displayName: '팀 새벽로켓',
  role: 'PARTICIPANT',
  entryId: MY_ENTRY_ID,
};

export const ADMIN_USER: User = {
  id: 'user-admin',
  email: 'ops@proovit.kr',
  displayName: 'PROOVIT OPS',
  role: 'ADMIN',
  entryId: null,
};

/* ------------------------------------------------------------ 제출물 */

export const SUBMISSIONS: StageSubmission[] = [
  {
    id: 'sub-s1',
    seasonId: 'season-1',
    entryId: MY_ENTRY_ID,
    stage: 'S1',
    title: '수요 검증',
    requirement: '랜딩 URL·GA4 증빙 제출 의무',
    status: 'NOT_SUBMITTED',
    dueAt: '2026-07-25T23:59:59+09:00',
    dueLabel: '마감 7/25 (금) 23:59',
    visitors: 492,
    signups: 61,
    conversionPct: 12.4,
  },
  {
    id: 'sub-s2',
    seasonId: 'season-1',
    entryId: MY_ENTRY_ID,
    stage: 'S2',
    title: 'MVP 빌드',
    requirement: '배포 URL·핵심 기능 데모 제출',
    status: 'LOCKED',
    dueAt: '2026-08-08T23:59:59+09:00',
    dueLabel: '마감 8/8 (토) 23:59',
  },
  {
    id: 'sub-s3',
    seasonId: 'season-1',
    entryId: MY_ENTRY_ID,
    stage: 'S3',
    title: '유저 확보 레이스',
    requirement: '주간 유효 가입자 애널리틱스 원본 제출',
    status: 'LOCKED',
    dueAt: '2026-08-22T23:59:59+09:00',
    dueLabel: '마감 8/22 (토) 23:59',
  },
];

/** 대시보드 "진행하기" 탭의 체크리스트 */
export interface GoldenPathStep {
  n: number;
  label: string;
  done: boolean;
  kind: 'guide' | 'benefit' | 'submit';
}

export const GOLDEN_PATH = {
  chapter: 'CH.2',
  title: '수요검증 랜딩 만들기',
  lockedChapter: { title: 'Ch.4 MVP 범위 자르기', hint: '1차 심사 통과 시 열려요.' },
  steps: [
    { n: 1, label: '랜딩 카피 작성하기', done: true, kind: 'guide' },
    { n: 2, label: 'AI 빌더로 랜딩 만들기', done: true, kind: 'guide' },
    { n: 3, label: 'GA4 연결하기', done: false, kind: 'guide' },
    { n: 4, label: '크레딧 발급받기', done: false, kind: 'benefit' },
    { n: 5, label: 'S1 제출하기', done: false, kind: 'submit' },
  ] as GoldenPathStep[],
};

/* -------------------------------------------------------- 주간 지표 */

export const WEEKLY_METRICS: WeeklyMetric[] = [
  {
    id: 'wm-1',
    seasonId: 'season-1',
    entryId: 'entry-1',
    week: 'W5',
    validUsers: 412,
    deltaPct: 38,
    evidenceName: 'GA4',
    status: 'PENDING',
  },
  {
    id: 'wm-2',
    seasonId: 'season-1',
    entryId: 'entry-2',
    week: 'W5',
    validUsers: 356,
    deltaPct: 9,
    evidenceName: 'GA4',
    status: 'PENDING',
  },
  {
    id: 'wm-3',
    seasonId: 'season-1',
    entryId: 'entry-3',
    week: 'W5',
    validUsers: 298,
    deltaPct: 7,
    evidenceName: 'GA4',
    status: 'PENDING',
  },
  {
    id: 'wm-4',
    seasonId: 'season-1',
    entryId: 'entry-5',
    week: 'W5',
    validUsers: 187,
    deltaPct: -4,
    evidenceName: 'GA4',
    status: 'PENDING',
  },
  {
    id: 'wm-5',
    seasonId: 'season-1',
    entryId: 'entry-6',
    week: 'W5',
    validUsers: 152,
    deltaPct: 5,
    evidenceName: 'GA4',
    status: 'CONFIRMED',
  },
];

/** 지표 검증 화면 요약 스트립 */
export const METRICS_SUMMARY = { weeklySubmitted: 18, confirmedBase: 11 };

/* ------------------------------------------------------------ 크레딧 */

export const CREDIT_OFFERS: CreditOffer[] = [
  {
    id: 'offer-builder',
    seasonId: 'season-1',
    kind: 'BUILDER',
    title: 'AI 빌더 1개월 Pro',
    description: '랜딩부터 MVP까지 만들 수 있는 Pro 플랜이에요.',
    status: 'AVAILABLE',
  },
  {
    id: 'offer-api',
    seasonId: 'season-1',
    kind: 'API',
    title: 'API 크레딧 $30',
    description: 'S1 수요 검증 제출 시 잠금 해제',
    status: 'LOCKED',
    unlockHint: '🔒 S1 제출 후',
  },
  {
    id: 'offer-hosting',
    seasonId: 'season-1',
    kind: 'HOSTING',
    title: '클라우드 호스팅 크레딧',
    description: '스폰서와 협의 중이에요. 확정되면 알려드릴게요.',
    status: 'NEGOTIATING',
  },
];

export const CREDIT_CLAIMS: CreditClaim[] = [];

/** 발급 코드 (시안과 동일) */
export const CREDIT_CODE = 'PROOVIT-S1-DAWN';

/* ------------------------------------------------------- 상호 테스터 */

export const PEER_REVIEWS: PeerReview[] = [
  {
    id: 'pr-1',
    seasonId: 'season-1',
    week: 'W5',
    fromEntryId: MY_ENTRY_ID,
    toEntryId: 'entry-2',
    status: 'DONE',
    createdAt: '2026-07-19T12:00:00+09:00',
  },
  {
    id: 'pr-2',
    seasonId: 'season-1',
    week: 'W5',
    fromEntryId: MY_ENTRY_ID,
    toEntryId: 'entry-3',
    status: 'ASSIGNED',
  },
  {
    id: 'pr-3',
    seasonId: 'season-1',
    week: 'W5',
    fromEntryId: 'entry-4',
    toEntryId: MY_ENTRY_ID,
    status: 'DONE',
    content:
      '가입 흐름이 깔끔해요. 다만 첫 화면에서 뭘 눌러야 할지 3초 정도 헤맸어요. 핵심 버튼을 더 키워보면 좋겠어요.',
    createdAt: '2026-07-21T10:00:00+09:00',
  },
  {
    id: 'pr-4',
    seasonId: 'season-1',
    week: 'W5',
    fromEntryId: 'entry-6',
    toEntryId: MY_ENTRY_ID,
    status: 'DONE',
    content:
      '아이디어가 확실해요! 알림 기능이 생기면 매일 들어올 것 같아요. 모바일에서 표가 살짝 잘리는 건 확인해보세요.',
    createdAt: '2026-07-20T10:00:00+09:00',
  },
];

/* -------------------------------------------------------- 심사 콘솔 */

/** 심사 대기 12건 (목록에는 대표 4건 노출) */
export const JUDGING_PENDING_COUNT = 12;

export const JUDGING_ITEMS: JudgingItem[] = [
  {
    id: 'jd-1',
    entryId: 'entry-1',
    teamName: '새벽로켓',
    serviceName: '빵집레이더',
    stage: 'S1',
    decision: 'PENDING',
    signups: 61,
    visitors: 492,
    conversionPct: 12.4,
    evidenceName: '증빙 GA4.png',
    aiReport: [
      '전환율 12.4%는 스테이지 1 전체 중앙값(6.8%)의 약 1.8배 수준',
      '고객 조사 요약에 구체적 시간대·구매 맥락 포함, 문제 정의 명확',
      '방문자 유입원 다양성은 증빙만으로 확인 불가 — 원본 요청 권장',
    ],
    aiScore: 72,
  },
  {
    id: 'jd-2',
    entryId: 'entry-9',
    teamName: '야근금지',
    serviceName: '퇴근알림봇',
    stage: 'S1',
    decision: 'PENDING',
    signups: 34,
    visitors: 505,
    conversionPct: 6.7,
    evidenceName: '증빙 GA4.png',
    aiReport: [
      '전환율 6.7%는 스테이지 1 전체 중앙값(6.8%)과 유사한 수준',
      '타깃 고객 정의가 넓어 문제 정의 구체성이 부족',
      '사전 신청자 34명 — 표본이 작아 해석에 주의 필요',
    ],
    aiScore: 51,
  },
  {
    id: 'jd-3',
    entryId: 'entry-10',
    teamName: '오후네시',
    serviceName: '간식투표',
    stage: 'S1',
    decision: 'PASSED',
    signups: 88,
    visitors: 719,
    conversionPct: 12.2,
    evidenceName: '증빙 GA4.png',
    aiReport: [
      '전환율 12.2%로 상위권, 방문자 규모도 충분',
      '사내 반복 사용 시나리오가 명확해 재방문 가능성 높음',
      '수익 모델은 아직 미정 — 최종 심사 전 보완 권장',
    ],
    aiScore: 78,
  },
  {
    id: 'jd-4',
    entryId: 'entry-4',
    teamName: '초록손',
    serviceName: '텃밭일지',
    stage: 'S1',
    decision: 'HELD',
    signups: 19,
    visitors: 402,
    conversionPct: 4.7,
    evidenceName: '증빙 GA4.png',
    aiReport: [
      '전환율 4.7%로 중앙값(6.8%) 미달',
      '랜딩 카피가 기능 나열 중심 — 문제 진술이 약함',
      '증빙 스크린샷의 기간 설정이 잘려 확인 불가 — 원본 요청 필요',
    ],
    aiScore: 44,
  },
];

/* ------------------------------------------------------------ 티커 */

export const TICKER_ITEMS: TickerItem[] = [
  { id: 'tk-1', text: '빵집레이더', highlight: '+12 가입', tone: 'lime' },
  { id: 'tk-2', text: '회의록요정 검증 완료', highlight: '✓', tone: 'lime' },
  { id: 'tk-3', text: '링크줍줍', highlight: '매출 발생', tone: 'gold' },
];

/* ------------------------------------------------- 랜딩 정적 콘텐츠 */

export const LANDING_FAQ = [
  {
    q: '코딩을 못 해도 되나요?',
    a: '네, AI 빌더와 스텝별 가이드로 첫 서비스를 완성할 수 있어요.',
  },
  {
    q: '지표는 어떻게 검증하나요?',
    a: '애널리틱스 원본을 제출받아 운영진이 확인한 뒤 리더보드에 반영해요.',
  },
  {
    q: '상금은 어디서 나오나요?',
    a: '참가비가 아니라 스폰서십과 자체 재원으로만 마련해요.',
  },
  {
    q: '1차에서 떨어지면 끝인가요?',
    a: '아니요, 테스터로 시즌에 계속 참여하고 다음 시즌에 재도전할 수 있어요.',
  },
];

export const LANDING_BENEFITS = [
  {
    title: '스텝별 골든패스 가이드',
    desc: '수요조사부터 빌드·배포·마케팅까지 따라만 하면 돼요.',
  },
  { title: 'AI 빌더·API 크레딧', desc: '스테이지를 통과할수록 잠금이 풀려요.' },
  { title: '상금과 공개 리더보드', desc: '시즌 성과가 그대로 포트폴리오가 돼요.' },
];

export const LANDING_WHY = [
  { no: '01', title: '전 과정 온라인', desc: '어디서든 같은 무대에서 경쟁해요.' },
  { no: '02', title: '6주 실측 경쟁', desc: '발표가 아니라 데이터로 평가받아요.' },
  {
    no: '03',
    title: '아이디어만 있으면 돼요',
    desc: '코딩 경험 없어도 가이드와 AI로 완성해요.',
  },
];

export const LANDING_CRITERIA = [
  {
    round: 'ROUND 1',
    title: '1차 심사 — 사업성',
    items: ['사전 신청자 수', '랜딩 전환율', '문제 정의 명확성'],
  },
  {
    round: 'FINAL',
    title: '최종 심사 — 실행',
    items: ['유효 가입자', '활성·재방문', '매출(가산점)'],
  },
];

export const COMPARE = {
  hackathon: ['8시간~1박 2일', '발표와 심사위원 점수', '출품하면 끝'],
  proovit: ['6주 리그', '실제 유저와 매출 데이터', '시즌이 끝나도 서비스는 남아요'],
};

export const APPLY_CONSENTS = [
  '지표의 공개 리더보드 게시 동의',
  '애널리틱스 원본 제출 동의',
  '매주 타 팀 서비스 2개 사용·피드백(상호 테스터) 동의',
];

/** 참가작 상세의 시즌 여정 */
export const ENTRY_JOURNEY = [
  { label: '수요 검증 통과', sub: 'W2', done: true },
  { label: 'MVP 배포', sub: 'W4', done: true },
  { label: '유저 300명', sub: 'W5', done: true },
  { label: '첫 매출', sub: '진행 중', done: false },
];
