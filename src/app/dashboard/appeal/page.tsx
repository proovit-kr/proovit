import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/EmptyState";
import { guardPage } from "@/lib/access";
import { RESPONSE_BUSINESS_DAYS } from "@/lib/appeal";
import { loadAppealView } from "@/lib/appeal-store";

import { AppealForm } from "./AppealForm";

import styles from "./appeal.module.css";

/*
  소명·이의신청 — PLN3 2장. **실격 팀에게 열려 있어야 하는 유일한 쓰기 화면이다.**

  실격을 다투는 자리를 실격이라는 이유로 막으면 규칙 제11조가 보장한 절차를 우리가
  닫는 셈이 된다. 라우트 정책의 `allowInactive`가 그 뜻이고, 대시보드가 실격 팀에게
  이 화면을 다음 액션으로 내주는 것도 같은 이유다(dashboard-state.ts).

  ⚠️ 창구가 셋인 것을 참가자에게 설명하지 않는다(appeal.ts 머리 주석). 대상을
  고르면 어느 표에 쓰는지는 우리가 정한다 — 자기가 제11조인지 제16조인지 알고
  창구를 고르는 사람은 없다.
*/

export const metadata: Metadata = {
  title: "소명·이의신청",
  robots: { index: false, follow: false },
};

const DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
});

export default async function Page() {
  const { viewer, access } = await guardPage(
    "dashboardAppeal",
    "/dashboard/appeal",
  );
  if (!viewer.entry || !viewer.team) notFound();

  const view = await loadAppealView(viewer.entry.id);
  const canWrite = access.ok && viewer.team.isLeader;

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <h1 className={styles.title}>소명·이의신청</h1>
        <p className={styles.purpose}>
          심사 결과나 어뷰징 검토에 이의가 있으면 여기서 신청합니다. 접수 후{" "}
          {RESPONSE_BUSINESS_DAYS}영업일 안에 판정 근거 지표 값을 포함해
          답변드립니다(규칙 제11조).
        </p>
        {!access.ok ? (
          <p className={styles.locked}>{access.message}</p>
        ) : !viewer.team.isLeader ? (
          <p className={styles.locked}>
            접수는 팀장이 합니다. 진행 상황은 팀원도 볼 수 있습니다.
          </p>
        ) : null}
      </header>

      <AppealForm
        targets={view.targets.map((target) => ({
          value: `${target.type}:${target.id}`,
          label: target.label,
          when: DATE.format(target.when),
          appealed: target.appealed,
        }))}
        canWrite={canWrite}
      />

      <section className={styles.history}>
        <h2 className={styles.historyTitle}>지난 신청</h2>
        {view.history.length === 0 ? (
          <EmptyState
            title="접수한 이의신청이 없습니다"
            detail="접수하면 이 자리에 답변 기한과 함께 남습니다."
          />
        ) : (
          <ul className={styles.list}>
            {view.history.map((item) => (
              <li key={item.id} className={styles.item}>
                <p className={styles.itemHead}>
                  <span className={styles.when}>
                    {DATE.format(item.submittedAt)} 접수
                  </span>
                  {item.respondedAt ? (
                    <span className={styles.answered}>
                      {DATE.format(item.respondedAt)} 답변
                      {item.corrected ? " · 정정됨" : null}
                    </span>
                  ) : item.responseDueAt ? (
                    <span className={styles.due}>
                      {DATE.format(item.responseDueAt)}까지 답변 예정
                    </span>
                  ) : null}
                </p>
                <p className={styles.reason}>{item.reasonText}</p>
                {item.responseText ? (
                  <p className={styles.response}>{item.responseText}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
