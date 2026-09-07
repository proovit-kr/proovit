import { Fragment } from "react";

import styles from "./Clauses.module.css";

/*
  **절이 줄바꿈에 잘리지 않게 붙든다.**

  `word-break: keep-all`은 어절(공백) 단위로만 끊게 해 준다(globals.css). 그
  다음이 없어서, 칸이 남아 있으면 어느 어절 뒤에서든 끊는다. FAQ 답이 이렇게
  갈라졌다 —

    … 참가자가 숫자를 입력하지 않고, 매출은
    결제사 정산 화면으로 확인해요.

  「매출은」 뒤는 읽는 사람이 쉬는 자리가 아니다. 바로 앞의 쉼표가 그 자리다.
  줄바꿈을 **문장 끝과 쉼표 뒤에서만** 일어나게 하고, 절이 한 줄에 안 들어갈
  때만 그 안에서 끊게 한다.

  ⚠️ CSS에는 「구두점 뒤에서 끊기를 선호하라」가 없다. `text-wrap: pretty`는
  마지막 줄 홀몸만 손보고, `balance`는 줄 길이를 고르게 할 뿐 어디서 끊을지는
  못 정한다. 그래서 절을 `inline-block`으로 감싼다 — 상자는 통째로 다음 줄로
  넘어가고, 상자가 한 줄보다 길 때만 안에서 접힌다. 넘칠 일이 없어서
  `overflow-wrap`이 하던 마지막 그물도 그대로 남는다.

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
