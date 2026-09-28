/*
  알림센터의 문안 — 시안 ver4 `#scr-noti`가 정본이다.
  화면(app/notifications)이 이 값을 그대로 그린다.
*/

export const NOTI_HEAD = {
  title: "알림센터",
  sub: "심사, 마감, 공지를 여기서 모아 봐요.",
  readAll: "전체 읽음",
} as const;

/**
 * 가입하면 받는 첫 알림 — 시안 ② nt-empty가 「막 가입한 사람」의 알림센터다.
 * 가입 어댑터(`auth-adapter.ts` createUser)가 사용자와 같이 만든다.
 */
export const NOTI_WELCOME = {
  type: "welcome",
  title: "환영해요 👋",
  body: "온보딩 체크리스트에서 시작해요, 팀 구성 → 측정 연동 순서예요.",
  linkUrl: "/dashboard",
} as const;

/**
 * 게이트 판정 통지 — 운영 심사 콘솔이 판정을 저장할 때 팀원마다 한 줄.
 * 시안 알림센터 목업의 「1차 심사 통과!」(2920행)가 통과 문구의 정본이다.
 * 미통과·2차 문구는 목업에 없어 같은 꼴로 지었다(내가 정함, 수연 확인 대기).
 */
export const NOTI_JUDGMENT = {
  type: "gate_result",
  pass: {
    1: {
      title: "1차 심사 통과!",
      body: "s3 빌드와 배포가 열렸어요. 배포 가이드를 확인해요.",
      linkUrl: "/dashboard/submit/s3",
    },
    2: {
      title: "2차 심사 통과!",
      body: "최종 순위는 시상 발표에서 확인해요.",
      linkUrl: "/dashboard/judgments",
    },
  },
  fail: {
    1: {
      title: "1차 심사 결과",
      body: "판정과 사유를 심사 결과에서 확인해요.",
      linkUrl: "/dashboard/judgments",
    },
    2: {
      title: "2차 심사 결과",
      body: "판정과 사유를 심사 결과에서 확인해요.",
      linkUrl: "/dashboard/judgments",
    },
  },
} as const;

/**
 * 게이트 미제출 통지 — 크론이 마감까지 안 낸 팀을 탈락시킬 때 팀원마다 한 줄
 * (gate-miss.ts). 운영규칙 제9조③ 「결과는 … 통지」, 제11조 이의신청 기한이 「결과
 * 통지 후 5영업일」이라 이 발송이 그 기산점이다. 제목은 판정 통지와 같고, 볼 판정이
 * 없어 허브로 보낸다. 2026-09-28 수연 확정.
 */
export const NOTI_GATE_MISSED = {
  type: NOTI_JUDGMENT.type,
  1: {
    title: "1차 심사 결과",
    body: "마감까지 제출이 없어 미통과 처리됐어요.",
    linkUrl: "/dashboard",
  },
  2: {
    title: "2차 심사 결과",
    body: "마감까지 제출이 없어 미통과 처리됐어요.",
    linkUrl: "/dashboard",
  },
} as const;
