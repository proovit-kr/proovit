/*
  운영 어뷰징 화면의 말 — 시안 `#scr-adm-abuse`(3131행).
  유형 이름은 시안 표의 셋(봇 트래픽 의심·자기 가입 반복·채널 위조 의심)을 제15조
  금지행위 7종에 맞춰 붙이고 나머지 넷은 같은 꼴로 지었다(내가 정함, 수연 확인 대기).
*/

export const ABUSE_KIND_LABEL: Record<string, string> = {
  bot_traffic: "봇 트래픽 의심",
  multi_account: "자기 가입 반복",
  paid_signup: "유료 가입 유도 의심",
  evidence_forged: "증빙 위조 의심",
  undisclosed_ad: "광고 미표기 의심",
  attack_or_spam: "공격·스팸 의심",
  false_representation: "채널 위조 의심",
};

export const SEVERITY_LABEL: Record<string, string> = {
  high: "높음",
  medium: "중간",
  low: "낮음",
};
