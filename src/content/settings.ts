/*
  계정 설정의 문안 — 시안 ver4 `#scr-settings`·`#mdl-quit`이 정본이다.
  화면(app/settings)이 이 값을 그대로 그린다.
*/

export const SETTINGS_HEAD = {
  title: "계정 설정",
  sub: "알림 채널과 계정을 관리해요.",
} as const;

export const SETTINGS_CHANNELS = {
  label: "수신 채널",
  email: { title: "메일", desc: "심사 결과와 마감 알림을 메일로 받아요" },
  alimtalk: { title: "알림톡", desc: "긴급 마감 알림만 카카오 알림톡으로 받아요" },
} as const;

export const SETTINGS_ACCOUNT = {
  label: "계정",
  /** 시안은 카카오만 그렸다. 구글은 같은 모양의 회색 배지(내가 정함, 수연 확인 대기) */
  linked: { kakao: "카카오 연결됨", google: "구글 연결됨" },
  logout: "로그아웃",
  quit: "탈퇴하기",
} as const;

export const SETTINGS_QUIT = {
  title: "정말 탈퇴할까요?",
  body: "시즌 진행 중 탈퇴하면 팀 참가가 함께 종료될 수 있어요. 기록은 운영 규정에 따라 보관 후 삭제돼요.",
  cancel: "취소",
  confirm: "탈퇴하기",
} as const;
