/*
  스테이지 제출 화면에 실제로 나가는 문구 — 시안 ver4 `#scr-submit` 그대로.

  ⚠️ **문구의 정본은 시안이다**(2026-09-22, 결제 연동과 같은 결정 — 시안이 옛
  판단보다 나중이면 시안을 따른다). 여기 있는 문장은 시안에서 옮긴 것이고, 시안에
  없는 자리(잠긴 버튼의 다른 문구 등)만 만들어 썼다. 만든 문장에는 「시안에 없다」를
  주석으로 남긴다. 대조 스크립트(`scripts/design-diff/submit.mjs`)가 이 글자를 잰다.

  ⚠️ **체크 배열은 순서가 곧 뜻이다.** 가이드 완료 체크·출시 전 점검은 저장된
  `payload.guideChecks`·`launchChecks`·`aiChecks`가 인덱스로 읽히므로, 항목을
  바꾸면 지난 제출의 체크가 다른 항목으로 읽힌다. 늘려야 하면 뒤에 붙인다.
  허브의 골든패스(content/hub.ts)와 s1·s2의 순서가 1:1이다.
*/

/** 머리 — 시안 `.hb-h1`·`.hb-sub` */
export const SUBMIT_HEAD = {
  title: "스테이지 제출",
  sub: "가이드를 따라오면 여기서 낼 건 이미 준비돼 있어요. 마감 전엔 재제출도 돼요.",
} as const;

/*
  판마다 제목과 칩. 시안 `.frm-hd` — 게이트는 `.gate-chip`(보라 점선), 나머지는
  `.pass-chip`. 탭 이름은 `stages.name`(DB)이 정본이라 여기 없다.
*/
export const SUBMIT_PANE = {
  s1: { title: "s1, 아이디어 등록과 고도화", chip: "제출 시 통과" },
  s2: { title: "s2, 랜딩, 수요조사", chip: "GATE 1, 1차 심사(사업성)" },
  s3: { title: "s3, AI 빌드와 배포", chip: "제출 시 통과" },
  s4: { title: "s4, 마케팅과 유저 유입", chip: "주간 반복 제출" },
  s5: { title: "s5, 트래픽과 매출", chip: "GATE 2, 2차 심사(최종)" },
} as const;

/** 안내줄 — 시안 `.info-strip`. 없는 판(s3·s4)은 없다 */
export const SUBMIT_INFO = {
  s1: "아래 10개 항목이 1차 심사의 평가 근거예요. 항목마다 채점 지표가 하나씩 붙어 있어서 한 칸에 몰아 쓰면 그 항목은 점수를 받을 수 없어요.",
  s2: "방문자와 사전 신청자 수는 팀 주소를 거친 접속을 플랫폼이 직접 세요. 여기서는 확인만 하고 숫자를 입력하지 않아요.",
  s5: "최종 지표는 자동으로 집계돼요, 이 화면의 제출은 확인 버튼 역할이에요.",
} as const;

/** 시안 `.frm-meta`의 고정 문구 */
export const SUBMIT_META = {
  /** s4 둘째 칸 */
  s4Week: "주차는 시스템이 지정해요",
} as const;

/** 시안 `.frm-ft .who` — s5는 데이터가 아니라 문장이다 */
export const SUBMIT_WHO = {
  s5: "submitted_by 확인 버튼을 누른 팀원으로 기록, 지표 스냅샷 {closesAt} 자동 확정",
  none: "submitted_by 미제출",
} as const;

/** 시안 `.frm-ft .sp`의 버튼 문구 */
export const SUBMIT_BUTTONS = {
  draft: "임시저장",
  submit: "제출하기",
  resubmit: "재제출하기",
  weekly: "이번 주 제출하기",
  final: "최종 제출 확인",
  /** s2 통과 뒤. 시안 `<button class="btn" disabled>` */
  lockedPass: "통과 후 잠김",
  /* 아래 셋은 시안에 없다 — 잠긴 이유가 통과가 아닐 때 */
  lockedJudging: "심사 중 잠김",
  closed: "마감됨",
} as const;

/** 시안 `.ro .lk` — 🔒은 아이콘(Icon lock)이라 글자에 없다 */
export const READ_ONLY_LOCK = "입력 불가";

// ═════════════════════════════════════════════════════════════
// s1 — 아이디어 등록과 고도화 (심사 기준서 2-2 고도화 문서 10종)
// ═════════════════════════════════════════════════════════════

/** 시안 `.fgrp` — 번호·이름·기준서 대분류 */
export const S1_GROUPS = {
  problem: { n: "01", title: "문제와 고객 정의", note: "기준서 대분류 1" },
  demand: { n: "02", title: "수요 검증", note: "기준서 대분류 2" },
  differentiation: { n: "03", title: "차별성", note: "기준서 대분류 3" },
  execution: { n: "04", title: "실행 가능성", note: "기준서 대분류 4" },
  monetization: { n: "05", title: "수익화 설계", note: "기준서 대분류 5" },
  check: { n: "06", title: "검증 대상과 완료 체크", note: null },
} as const;

export const S1_FIELDS = {
  concept: {
    label: "한마디 컨셉",
    hint: "\"누구를 위한 무엇\" 한 문장이면 충분해요. 문제 문장은 아래 ②에 따로 써요.",
  },
  persona: {
    no: "①",
    label: "페르소나 정의",
    hint: "상황과 행동으로 특정된 단일 페르소나예요. 문제 해결을 위해 이미 한 행동(지불, 검색, 수작업)을 적어요. 출처는 무관해요.",
  },
  problem: {
    no: "②",
    label: "문제 정의 1문장",
    hint: "누가, 언제, 왜 겪는지 한 문장으로. 솔루션을 문제처럼 쓰지 않아요.",
  },
  problemDoc: {
    label: "문제 정의 상세",
    note: "둘 중 하나 필수",
    /* 시안 `.seg`의 두 칸과 파일 쪽 `.drop`의 둘째 줄 */
    seg: ["직접 작성", "파일 업로드"],
    dropSub: "PDF, 이미지, 10MB 이하",
  },
  survey: {
    no: "③",
    label: "조사 기록",
    note: "비지인 5인 인터뷰 또는 30명 설문",
    countPlaceholder: "인원",
    channelPlaceholder: "모집 경로",
    seg: ["전원 비지인", "일부 지인 포함"],
    summaryPlaceholder: "조사 요약",
    hint: "직접 접촉한 조사만 인정돼요. 출처 불명 시장 통계 인용은 0점 기준이에요.",
  },
  hypothesisChange: {
    no: "④",
    label: "가설 변화 기록",
    hint: "무엇이 확인되고 무엇이 수정됐는지. 피벗은 감점이 아니라 검증이 작동한 증거예요.",
  },
  alternatives: {
    no: "⑤",
    label: "기존 대안 분석",
    note: "2개 이상, 각각의 불만 지점",
    namePlaceholder: "대안",
    painPlaceholder: "불만 지점",
    hint: "공식 경쟁사가 아니라 고객이 지금 쓰는 해결책이에요. 수작업, 엑셀, 검색도 대안이에요.",
  },
  differentiation: {
    no: "⑥",
    label: "차별 포인트",
    hint: "⑤의 불만 지점과 1:1로 연결된 차별 요소와, 기존 대안이 그것을 못 하는 이유예요.",
  },
  coreFeature: {
    no: "⑦",
    label: "MVP 범위, 핵심 가치 루프 1개",
    hint: "\"○○을 넣으면 △△가 나온다\"의 최단 경로 하나예요. 로그인과 결제 같은 지원 기능은 개수에 넣지 않아요.",
  },
  notBuilding: { label: "이번 시즌에 안 만들 것", note: "2개" },
  buildPlan: {
    no: "⑧",
    label: "주차별 빌드 계획",
    note: "표준 도구 기준, 핵심 리스크 1개와 대응",
  },
  timeline: {
    no: "⑨",
    label: "실행 타임라인",
    note: "등록 이후 실제로 한 일",
    hint: "랜딩 배포, 포스팅, 인터뷰의 날짜와 증빙이에요.",
  },
  chargeType: {
    no: "⑩",
    label: "과금 유형",
    note: "심사 중 변경 불가",
    hint: "이 값이 2차 심사의 수익화 단계 트랙과 결제 연동 화면의 상태를 결정해요. 결제형은 결제 연동, 문의형은 유효 문의와 상담 기록으로 판정받아요.",
  },
  pricing: { label: "가격 가설", note: "누가, 언제, 무엇에, 얼마" },
  monetizationPlan: {
    label: "시즌 내 수익화 계획",
    hint: "레이스 기간 안에 결제 또는 문의 검증까지 도달하는 계획이에요. 시즌 밖 장기 로드맵만 있으면 0점 기준이에요.",
  },
  riskiest: {
    label: "가장 위험한 가정",
    hint: "이 가정이 s2 수요조사에서 검증할 대상이에요.",
  },
} as const;

/** 시안 `.frm .cnt-note` */
export const S1_COUNT_NOTE =
  "글자 수 상한과 필수 여부는 PLN6 필드 정의서가 기준서를 따라오면 확정돼요.";

/*
  과금 유형 — 시안 s1 ⑩의 `<select>` 두 줄 그대로.

  **첫 제출 뒤에는 바꿀 수 없다**(심사 기준서 v0.3 · 스키마 `entries.charge_type`
  주석). 2차 심사의 수익화 트랙이 이 값으로 갈리므로, 지표를 본 뒤에 유리한
  쪽으로 바꾸는 길을 막아야 한다.
*/
export const CHARGE_TYPES = [
  { value: "payment", label: "결제형, 서비스 안에서 결제를 받아요" },
  { value: "inquiry", label: "문의형, B2B 등 결제 연결이 구조적으로 어려워요" },
] as const;

// ═════════════════════════════════════════════════════════════
// 공통 — 가이드 완료 체크 · 자기 메모 · 증빙
// ═════════════════════════════════════════════════════════════

/*
  가이드 완료 체크 — 시안이 판마다 「CH.n 완료 체크와 1:1」로 단 세 줄.
  허브의 골든패스(HUB_GOLDEN_PATH)가 s1·s2를 같은 순서로 읽는다.
*/
export const GUIDE_CHECKS = {
  s1: {
    chapter: "CH.1",
    items: [
      "프롬프트 3개를 같은 대화방에서 실행 완료",
      "레드팀 판정 진행 가능",
      "문제 정의 1페이지 저장 완료",
    ],
  },
  s2: {
    chapter: "CH.2",
    items: [
      "수요검증 랜딩 배포 완료",
      "스레드 포스팅 1개 이상 발행",
      "사전 신청 폼에 유입 경로 문항 포함",
    ],
  },
  s3: {
    chapter: "CH.5",
    items: [
      "표준 빌더에서 핵심 가치 루프 1개 구현",
      "최종 배포 주소 발행, 팀 주소 연결",
      "가입 흐름을 처음부터 끝까지 테스트",
    ],
  },
  s4: {
    chapter: "CH.6",
    items: [
      "이번 주 유입 채널 1개 이상 새로 시도",
      "내 지표에서 이탈 지점 1개 확인",
      "확인한 이탈 지점 1개 개선",
    ],
  },
  s5: {
    chapter: "CH.8",
    items: ["결제사 정산 화면 원본 준비 (수익화 시)", "회고 작성", "공개 동의 확인"],
  },
} as const;

export const GUIDE_LABEL = "가이드 완료 체크";
/** 라벨 옆 부연 — `CH.1 완료 체크와 1:1` */
export const guideNote = (chapter: string) => `${chapter} 완료 체크와 1:1`;

export const MEMO_FIELD = {
  label: "자기 메모",
  note: "심사에 반영되지 않아요",
  /* 판마다 자리표시가 다르다. 없는 판(s2·s3)은 없다 */
  placeholder: {
    s1: "다음 시즌의 나에게 남길 말",
    s4: "이번 주에 배운 것",
    s5: "다음 시즌의 나에게 남길 말",
  } as Record<string, string | undefined>,
} as const;

/*
  증빙 파일 — 시안은 판마다 `.drop`(끌어다 놓기)과 `.file`(올린 파일 칩)을 그린다.
  부연(`<small>`)은 시안 문구 그대로. 필수 여부는 시안도 「확정 대기」라 어느 판도
  파일을 강제하지 않는다 — s1 「문제 정의 상세」의 본문·파일 「둘 중 하나」만 건다.
*/
export const EVIDENCE_FIELD = {
  label: "증빙 파일",
  note: {
    s1: "인터뷰 기록, 포스팅 캡처",
    /* 시안은 앞에 ⚠️(SVG)가 붙는다 — 화면이 Icon으로 그린다 */
    s2: "필수 여부 확정 대기, PLN6 6장",
    s3: "선택, 스테이지별 필수 여부 확정 대기",
    s4: "선택, 포스팅 캡처",
    s5: "수익화 시 결제사 정산 화면 원본",
  },
  drop: "파일을 끌어다 놓거나 클릭해서 업로드",
  /* `.drop`의 둘째 줄이 있는 판 */
  dropSub: { s5: "이용자 개별 식별 항목은 가려서 올려요" },
} as const;

/** 업로드 중·실패 안내. 서버(api/evidence)와 화면이 같은 문장을 쓴다 */
export const EVIDENCE_MESSAGE = {
  uploading: "올리는 중…",
  tooBig: "10MB 이하의 파일만 올릴 수 있어요.",
  badType: "PDF나 이미지(PNG·JPG·WebP·GIF)만 올릴 수 있어요.",
  tooMany: "파일은 5개까지 올릴 수 있어요.",
  noFile: "파일이 없어요.",
  unreadable: "파일을 읽지 못했어요. 다시 올려 주세요.",
  noStorage: "증빙 저장소가 아직 연결되지 않았어요. 운영자에게 알려 주세요.",
  failed: "올리지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  remove: "빼기",
  /* 잠긴 판의 빈 파일 칸 */
  none: "올린 파일이 없어요.",
} as const;

// ═════════════════════════════════════════════════════════════
// s2 — 랜딩, 수요조사 (GATE 1)
// ═════════════════════════════════════════════════════════════

export const S2_FIELDS = {
  landingUrl: { label: "랜딩 주소", note: "팀명.proovit.kr 필수" },
  visitors: {
    label: "방문자 수",
    note: "프록시 집계, 읽기 전용",
    /* 앞의 기간은 화면이 데이터로 채운다 — 「10.05~10.10 유효 방문」 */
    text: "유효 방문",
  },
  leads: {
    label: "사전 신청자 수",
    note: "프록시 집계, 읽기 전용",
    text: "팀원 제외, 중복 제거",
  },
  conversion: { label: "전환율", note: "자동 계산", text: "신청자 ÷ 방문자" },
  channels: {
    label: "홍보한 채널",
    note: "최소 1개",
    placeholder: "채널 입력 후 Enter",
    hint: "s1에서 정한 페르소나 채널과 대조돼요.",
  },
  postUrl: { label: "배포 채널 포스팅 링크", note: "1개 이상" },
} as const;

// ═════════════════════════════════════════════════════════════
// s3 — AI 빌드와 배포
// ═════════════════════════════════════════════════════════════

export const S3_FIELDS = {
  serviceUrl: {
    label: "서비스 주소",
    hint: "팀명.proovit.kr 연결을 권장해요, 연결돼 있어야 트래픽이 집계돼요.",
  },
  builder: {
    label: "사용한 빌더",
    note: "선택지는 배포처 등급 확정(9.14) 후 일괄 반영",
    hint: "Vercel과 GitHub Pages는 약관상 상업 사용이 막혀 있어 주소 등록 단계에서 자동 차단돼요. 그 외 금지 도구도 저장이 거부돼요.",
  },
  signup: {
    label: "가입 기능 연결",
    title: "서비스에 가입 기능이 붙어 있어요",
    desc: "이메일, 소셜 무엇이든 좋아요",
    /* 시안 `.warn-off` — 토글이 꺼져 있을 때만 보인다 */
    warnOff: "꺼진 상태로 제출하면 가입자 축 점수가 0점이 돼요.",
  },
  paymentReturn: {
    label: "결제 복귀 주소 등록",
    note: "수익화할 때만",
    title: "결제 후 복귀 주소를 등록했어요",
    desc: "팀명.proovit.kr 경로만 인정돼요",
  },
  launch: {
    label: "출시 전 점검",
    note: "참가팀용 개인정보, AI 표시 체크리스트 v1.0, 16항목",
    hint: "저장 순서가 그대로 체크 배열이 돼요. 이메일 하나만 받아도 PART A 전체가 해당돼요.",
    partA: "PART A, 개인정보 10",
    partB: "PART B, AI 표시 (생성형 AI 결과물을 보여주는 참가작만)",
    bHint: "B0에 해당하지 않으면 아래 5개는 건너뛰어요. 해당하면 B0를 체크한 뒤 진행해요.",
  },
} as const;

/*
  빌더 — 시안 s3의 `<select>` 네 줄 그대로. 시안 부연대로 「배포처 등급 확정(9.14)
  후 일괄 반영」이라, 8/15에 동혁 보고서로 짠 여덟 줄(Lovable·Cloudflare Pages·
  Bolt·Netlify·Render·Cloud Run·Replit·그 외)은 시안(09-10)이 더 나중이라 접었다.
  금지 도구는 여기 없다 — 측정 주소 등록에서 막는다(measurement.ts).
*/
export const BUILDERS = [
  { value: "replit", label: "Replit (표준)" },
  { value: "lovable", label: "Lovable (허용)" },
  { value: "cursor", label: "Cursor (허용)" },
  { value: "other", label: "기타 (허용)" },
] as const;

/*
  출시 전 점검 — PART A. 개인정보.

  정본은 운영규칙서 제6장 「참가팀용 개인정보·AI 표시 체크리스트 v1.0」이고 문구는
  시안이 줄인 그대로다. 순서와 개수를 바꾸면 저장된 boolean[]의 뜻이 어긋난다.
*/
export const LAUNCH_CHECKS = [
  { key: "A1", label: "최소수집, 지금 폼의 모든 입력란이 정말 필요한지 확인했어요" },
  {
    key: "A2",
    label: "동의문에 항목, 목적, 보유 기간, 거부 권리 4요소가 있고 필수와 선택 체크박스를 분리했어요",
  },
  { key: "A3", label: "개인정보처리방침을 만들어 사이트 하단에 링크했어요" },
  { key: "A4", label: "만 14세 이상 확인을 받고 미만은 차단해요" },
  { key: "A5", label: "주민등록번호 입력란이 없어요" },
  {
    key: "A6",
    label: "해외 서비스(호스팅, DB, GA4, 메일)의 국외 이전 표를 처리방침에 넣었어요",
  },
  { key: "A7", label: "광고 메일은 사전 수신 동의와 (광고) 표기, 수신거부 방법을 갖췄어요" },
  {
    key: "A8",
    label: "비밀번호 해시 저장, 전 구간 HTTPS, IDOR 점검, API 키 미커밋을 확인했어요",
  },
  { key: "A9", label: "유출 시 72시간 내 통지와 신고 절차를 알고 있어요" },
  { key: "A10", label: "금전이나 상품권 대가로 가입을 유도하지 않아요" },
] as const;

/** PART B의 문 — 시안 `.b0`. 켜야 B1~B5가 열린다 */
export const AI_GATE = {
  key: "B0",
  label: "우리 서비스는 생성형 AI로 글, 이미지, 답변을 만들어 이용자에게 보여줘요",
} as const;

/** 출시 전 점검 — PART B. AI 표시. 생성형 AI 결과물을 보여주는 참가작만 */
export const AI_CHECKS = [
  { key: "B1", label: "생성형 AI 기반 서비스라는 사실을 약관 또는 화면에서 미리 알려요" },
  { key: "B2", label: "AI가 생성한 결과물에 생성 사실을 표시해요 (배지, 문구, 워터마크)" },
  { key: "B3", label: "표시 문구를 서비스 유형에 맞게 넣었어요 (채팅형, 생성형, 요약형)" },
  {
    key: "B4",
    label: "사람의 얼굴이나 목소리를 실제처럼 합성하지 않거나, 한다면 명확히 고지해요",
  },
  { key: "B5", label: "AI 고지와 표시 이행 여부가 2차 심사 감점 요소가 될 수 있음을 알아요" },
] as const;

// ═════════════════════════════════════════════════════════════
// s4 — 마케팅과 유저 유입 (주간 반복)
// ═════════════════════════════════════════════════════════════

export const S4_FIELDS = {
  activity: { label: "그 주에 한 활동" },
  channels: { label: "새로 쓴 유입 채널", note: "선택", placeholder: "채널 입력 후 Enter" },
  improved: { label: "개선한 이탈 지점", note: "선택" },
  weekly: {
    label: "주간 지표",
    note: "자동 집계",
    visitors: "방문",
    signups: "가입",
    text: "엣지에서 자동으로 세요",
  },
} as const;

/** 시안 `.wk` — 「1주차 제출됨」·「2주차 작성 중」 */
export const WEEK_CHIP = {
  done: (week: number) => `${week}주차 제출됨`,
  now: (week: number) => `${week}주차 작성 중`,
} as const;

// ═════════════════════════════════════════════════════════════
// s5 — 트래픽과 매출 (GATE 2)
// ═════════════════════════════════════════════════════════════

export const S5_FIELDS = {
  monetized: {
    label: "수익화 시도 여부",
    title: "이번 시즌에 수익화를 시도했어요",
    desc: "매출은 가산점이에요, 없어도 괜찮아요",
  },
  paymentConnected: {
    label: "결제 연동 여부",
    note: "수익화 시",
    title: "결제 연동을 마쳤어요",
    desc: "연동 상태와 대조돼요",
    /* 뒤의 상태는 결제 연동 화면의 판을 데이터로 붙인다 */
    status: "결제 연동 상태:",
  },
  final: {
    label: "최종 지표",
    note: "자동 집계, 읽기 전용",
    cards: ["유효 이용자", "주간 활성", "재방문율", "매출"],
  },
  retro: {
    label: "회고",
    placeholder: "5주 동안 무엇을 배웠나요?",
    hint: "시즌 리포트에 실릴 수 있어요.",
  },
  consent: {
    req: "[필수]",
    label: "최종 지표와 회고를 시즌 아카이브에 공개하는 것에 동의해요",
  },
} as const;

/** 결제 연동 상태 — s5 「결제 연동 상태: …」 뒤에 붙는 말. 시안은 ok 하나다 */
export const PAYMENT_STATE_LABEL = {
  ok: "연동 확인됨 ✓",
  pending: "확인 대기",
  none: "등록 전",
  inq: "문의형",
} as const;
