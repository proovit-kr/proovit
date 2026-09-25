/*
  KST 시각 표기 — **의존성이 없다.** 화면(클라이언트)도 이 파일을 읽는다.

  submission.ts에 있던 것을 떼어 왔다(2026-09-26). 팀 규칙(team.ts)이 합류 마감을
  적으려고 submission.ts를 끌어오자, team.ts를 읽는 클라이언트 컴포넌트(TeamPanel)
  번들에 제출 스키마와 콘텐츠까지 따라갈 수 있었다 — 최상위의 z 스키마 호출은
  부수효과가 없다고 번들러가 가정하지 못해 떨어지지 않을 수 있다. 표기만 쓰는
  쪽은 여기서 가져간다. 여기에 import를 늘리지 않는다.
*/

const DAY_MS = 86_400_000;

type SeoulParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
};

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function seoulParts(at: Date): SeoulParts {
  const part = Object.fromEntries(
    PARTS.formatToParts(at).map((p) => [p.type, p.value]),
  );
  return {
    year: part.year,
    month: part.month,
    day: part.day,
    hour: part.hour,
    minute: part.minute,
  };
}

/**
 * 마감의 「마지막 날 + 시각」. 자정에 닫히는 마감은 **전날 24:00**이다 —
 * 「11.17 00:00」은 하루를 더 주는 것처럼 읽히고, 시안도 그 자리를 24:00으로 썼다.
 * 모양이 다른 표기(메일의 「2026년 10월 18일 24:00」)가 같은 규칙을 쓰도록 조각으로 준다.
 */
export function deadlineParts(at: Date): {
  year: string;
  month: string;
  day: string;
  time: string;
} {
  const part = seoulParts(at);
  if (part.hour === "00" && part.minute === "00") {
    const prev = seoulParts(new Date(at.getTime() - DAY_MS));
    return { year: prev.year, month: prev.month, day: prev.day, time: "24:00" };
  }
  return {
    year: part.year,
    month: part.month,
    day: part.day,
    time: `${part.hour}:${part.minute}`,
  };
}

/** 마감 표기 — 시안 `마감 10.04 23:59`·`집계 확정 11.01 24:00` */
export function formatDeadline(at: Date): string {
  const part = deadlineParts(at);
  return `${part.month}.${part.day} ${part.time}`;
}

/** 시각 표기 — 시안 `제출 이윤서, 10.02 21:14` */
export function formatMoment(at: Date): string {
  const part = seoulParts(at);
  return `${part.month}.${part.day} ${part.hour}:${part.minute}`;
}

/** 날짜만 — 시안 s2의 `10.05~10.10` */
export function formatDay(at: Date): string {
  const part = seoulParts(at);
  return `${part.month}.${part.day}`;
}
