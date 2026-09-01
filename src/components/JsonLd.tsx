/*
  구조화 데이터(JSON-LD).

  검색엔진에 「이 사이트가 무엇인가」를 기계가 읽는 형태로 말한다. 지금 넣는
  것은 조직 하나뿐이다 — 이름·주소·로고·한 줄 설명.

  ⚠️ **화면에 없는 것을 여기에 적지 않는다.** 구조화 데이터는 사람 눈에
  안 보이는 자리라 「검색용으로만」 값을 부풀리기 쉬운데, 그건 스팸 정책
  위반이고 이 리그가 파는 「조작 불가능한 지표」와 정면으로 어긋난다.
  그래서 순위·참가팀 수·수상 내역은 넣지 않는다.

  ⚠️ Event 스키마(리그 일정)를 아직 안 넣는다. Event는 `startDate`가 필수인데
  시즌1 캘린더가 잠정이라 `startsAt`이 비어 있다. 날짜를 지어내지 않는다
  (시즌 상세 화면의 「일정 확정 전」과 같은 규칙). 일정이 확정되면 그때 넣는다.

  ⚠️ `sameAs`(SNS 계정)도 비워 둔다. 확인된 공식 계정이 아직 없다 —
  추측해서 넣으면 남의 계정을 우리 것이라고 말하는 셈이다.
*/
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export function OrganizationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "PROOVIT",
    url: siteUrl,
    /* 파일 규약이 실제로 내보내는 주소다(layout.tsx 「아이콘」 주석) */
    logo: `${siteUrl}/apple-icon.png`,
    description:
      "아이디어를 가진 1~2인 팀이 AI로 실제 웹서비스를 만들고, 외부 이용자와 매출로 겨루는 온라인 시즌제 리그.",
  };

  /*
    JSON-LD는 `<script>` 안의 문자열이라 React가 이스케이프해 주지 않는다.
    값이 전부 이 파일 안의 상수라 지금은 안전하지만, DB에서 온 값을 넣게 되면
    `<`를 막아야 한다 — 참가작 이름에 `</script>`가 들어오면 문서가 갈린다.
  */
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
