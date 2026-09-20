import { Fragment, type ReactNode } from "react";

import styles from "./Clauses.module.css";

/*
  **절이 줄바꿈에 잘리지 않게 붙든다.**

  `word-break: keep-all`은 어절(공백) 단위로만 끊게 해 준다(globals.css). 그
  다음이 없어서, 칸이 남아 있으면 어느 어절 뒤에서든 끊는다. FAQ 답이 이렇게
  갈라졌다 —

    … 참가자가 숫자를 입력하지 않고, 매출은
    결제사 정산 화면으로 확인해요.

  「매출은」 뒤는 읽는 사람이 쉬는 자리가 아니다. 바로 앞의 쉼표가 그 자리다.
  줄바꿈을 **문장 끝과 쉼표 뒤에서만** 일어나게 한다.

  ⚠️ CSS에는 「구두점 뒤에서 끊기를 선호하라」가 없다. `text-wrap: pretty`는
  마지막 줄 홀몸만 손보고, `balance`는 줄 길이를 고르게 할 뿐 어디서 끊을지는
  못 정한다. 그래서 절을 `inline-block`으로 감싼다 — 상자는 통째로 다음 줄로
  넘어간다.

  ⚠️ **한 줄에 못 들어가는 절은 상자를 벗긴다**(`ClauseFit.tsx`). 안 그러면 줄을
  하나 더 먹는다. 상자가 한 줄보다 길면 어차피 안에서 접히는데, 그 접힌 마지막
  줄이 짧아도 다음 절이 거기 못 들어오기 때문이다 —

    팀별 주소(팀명.proovit.kr)를 거치는 트래픽을 플랫폼이 직접
    집계해요.                        ← 남은 자리에 다음 문장이 못 온다
    참가자가 숫자를 입력하지 않고, 매출은 결제사 정산 화면으로
    확인해요.

  못 들어가는지는 칸 너비를 알아야 정해지고, 그건 브라우저만 안다. 그래서 이
  판정만 화면에서 한다. 자바스크립트가 죽으면 전부 상자로 남는데, 그건 줄이
  한둘 늘 뿐 글이 깨지는 상태가 아니다.

  ⚠️ **글자 대조는 이 때문에 깨지지 않는다.** `diffText`가 조각을 이어 붙여
  견주므로(cdp.mjs), 시안이 한 노드로 쓴 문장을 우리가 절로 쪼개도 통과한다.
*/

/**
 * 문장 끝(`.` `?` `!`)과 쉼표 뒤에서 자른다. **뒤에 공백이 올 때만** 자른다 —
 * 그래야 `팀명.proovit.kr`, `제18조`, `v3.1`처럼 구두점이 낱말 안에 든 것을
 * 건드리지 않는다. 구두점은 앞 절에 붙여 둔다.
 */
export function splitClauses(text: string): string[] {
  return text.split(/(?<=[.?!,])\s+/).filter(Boolean);
}

/**
 * 절마다 `inline-block` 상자를 씌운다. 절이 하나뿐이면 그대로 돌려준다 —
 * 붙들 자리가 없는데 상자만 만들면 `inline-block`의 베이스라인 규칙만 탄다.
 */
export function Clauses({ text }: { text: string }) {
  const parts = splitClauses(text);
  if (parts.length < 2) return text;
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 ? " " : null}
      <span className={styles.c}>{part}</span>
    </Fragment>
  ));
}

/**
 * 강조 조각(`.em` 등)이 섞인 줄. 문자열만 자르고 조각은 통으로 둔다.
 *
 * ⚠️ **조각마다 `Clauses`를 부르면 절이 조각 경계에서 끊긴다.** 규칙 화면의
 * 「심사 관문은 <em>…마감 10.11</em>과 <em>s5 2차 심사(최종)…</em>」이 그랬다 —
 * 절 하나가 세 노드에 걸쳐 있어 붙들 상자가 없었고, 1440에서 「…10.11과」
 * 뒤가 갈라졌다. 절 경계는 **이어 붙인 글 전체**에서 구해야 한다.
 */
export type ClausePart = string | { text: string; node: ReactNode };

export function ClauseParts({ parts }: { parts: ClausePart[] }) {
  const full = parts.map((p) => (typeof p === "string" ? p : p.text)).join("");

  /* 문장 끝과 쉼표 뒤. 뒤에 공백이 올 때만 자른다(`splitClauses`와 같은 규칙) */
  const cuts: number[] = [];
  for (let i = 0; i < full.length - 1; i++) {
    if (/[.?!,]/.test(full[i]) && /\s/.test(full[i + 1])) cuts.push(i + 1);
  }

  /* 조각 안으로 떨어지는 경계는 버린다 — 조각은 쪼개지 않는다 */
  const clauses: ClausePart[][] = [[]];
  let at = 0;
  for (const part of parts) {
    if (typeof part !== "string") {
      clauses[clauses.length - 1].push(part);
      at += part.text.length;
      continue;
    }
    let from = 0;
    for (const cut of cuts) {
      if (cut <= at + from || cut >= at + part.length) continue;
      clauses[clauses.length - 1].push(part.slice(from, cut - at));
      clauses.push([]);
      from = cut - at;
    }
    clauses[clauses.length - 1].push(part.slice(from));
    at += part.length;
  }

  const boxes = clauses
    .map((pieces) => {
      const trimmed = pieces.map((p, i) => {
        if (typeof p !== "string") return p;
        let t = p;
        if (i === 0) t = t.trimStart();
        if (i === pieces.length - 1) t = t.trimEnd();
        return t;
      });
      return trimmed.filter((p) => p !== "");
    })
    .filter((pieces) => pieces.length);

  const render = (pieces: ClausePart[]) =>
    pieces.map((p, i) => (
      <Fragment key={i}>{typeof p === "string" ? p : p.node}</Fragment>
    ));

  /* 절이 하나뿐이면 상자를 만들지 않는다 — `Clauses`와 같은 이유다 */
  if (boxes.length < 2) return <>{render(boxes[0] ?? [])}</>;

  return boxes.map((pieces, i) => (
    <Fragment key={i}>
      {i > 0 ? " " : null}
      <span className={styles.c}>{render(pieces)}</span>
    </Fragment>
  ));
}
