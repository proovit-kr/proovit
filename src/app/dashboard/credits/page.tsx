import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Badge } from "@/components/Badge";
import { AnchorButton, Button, LinkButton } from "@/components/Button";
import { Clauses } from "@/components/Clauses";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/Surface";
import {
  CREDITS_FOOT,
  CREDITS_HEAD,
  CREDITS_NEXT,
  CREDITS_NOTE,
  CREDITS_SUM,
  CREDITS_UNLOCK,
  CREDIT_CARD_TEXT as T,
} from "@/content/credits";
import { CreditKind, EntryStatus, StageKey } from "@/generated/prisma/enums";
import { guardPage } from "@/lib/access";
import { gateOf } from "@/lib/access-policy";
import {
  type CreditCardState,
  creditBadge,
  creditValueTotal,
  creditsPane,
  isDeliveredCard,
  isOpenedCard,
  maskCreditCode,
  nextUnlock,
} from "@/lib/credits";
import { loadCreditCenter, type CreditCardView } from "@/lib/credits-store";
import { devNow } from "@/lib/dev-clock";

import hub from "../hub.module.css";
import { ClauseFit } from "@/components/ClauseFit";

import { AppliedCheck, ClaimForm, CopyButton } from "./CreditActions";
import { CreditsToast } from "./CreditsToast";
import { Rail } from "./Rail";

import styles from "./credits.module.css";

/*
  혜택과 크레딧 — 시안 ver4 `#scr-credits` 일곱 판(`.sb[data-cr]`).

    ① pend    협의 중, 폴백      모집 중, 카드 넷 다 「협의 중」
    ② locked  s1 제출 전         카드 넷 다 「잠금」
    ③ sched   s1 제출, 발급 예정  C1이 빌드 시작일을 기다린다
    ④ build   빌드 시작, 발급 완료 C1 발급 완료 · C2 발급 가능
    ⑤ race    레이스, 발급 확인   C1 확인 · C2 완료 · C3 협의 중인데 열림
    ⑥ tester  테스터 전환         경고줄, C1만 받은 채 나머지는 잠금
    ⑦ end     시즌 종료           안내줄, C3 만료 · C4 시상 확정

  판은 데이터의 결과다 — 카드 상태(`credits.ts` `creditCardState`)·시즌 구간·
  참가 상태가 정하고, 화면은 그 결과를 그릴 뿐이다. 개발 바의 「크레딧」 줄이
  일곱 판을 심는다(`dev-sandbox.ts` `setSandboxCredits`).

  값은 `node scripts/design-diff/fold-spec.mjs --media '^\.cr'`의 최종 승자를
  `credits.module.css`가 그대로 든다. 대조는 `scripts/design-diff/credits.mjs`.

  시안과 일부러 다른 것(내가 정함, 2026-09-23, 수연 확인 대기):
    · 시안의 `.lnk`는 토스트만 띄우는 자리표다. 우리는 실제 링크다 — 「조건
      자세히」→ 규칙, 「받을 이메일 확인」→ 계정 설정, 「협의 현황 보기」→ 알림센터,
      「적용 방법」→ 카드의 `howto_url`(없으면 안 그린다), 「시상 안내 보기」→ 심사 결과.
    · 「폴백 가이드 열기」는 `fallback_url`이 있을 때만 선다.
    · 시안 ⑦ 「받은 코드는 11.30까지」는 받은 코드 중 가장 이른 유효기간이다.
    · 게이트 1 통과의 「다음 언락」 문장은 시안에 없어 같은 꼴로 맞췄다(content).
    · 카드 본문(`.ds`)은 카드에 설명이 있을 때만 그린다.
  시안과 일부러 다른 것(2026-09-30 수연 결정):
    · C1의 지급 시점은 **그 팀의** 빌드 시작일(게이트 1을 통과한 날)이다 — 시안의
      달력 날짜 「빌드 시작일 10.12」가 아니다(lib/credits.ts `releaseDue`). 게이트 1
      전에는 「게이트 1 통과 때」이고, ③의 발급 예정 줄과 「다음 언락」에 날짜·D-day가
      없다.
  `data-probe`·`data-state`는 대조 스크립트가 지금 어느 판인지 읽는 표식이다.
*/

export const metadata: Metadata = {
  title: "혜택과 크레딧",
  robots: { index: false, follow: false },
};

const DAY = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
});
const MINUTE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
/** 「10.12」 — ko-KR은 「10. 12.」로 찍으므로 다듬는다 */
const day = (d: Date) => DAY.format(d).replace(/\s/g, "").replace(/\.$/, "");
const minute = (d: Date) => {
  const [date, time] = MINUTE.format(d).split(/\s+(?=\d{2}:\d{2})/);
  return `${date.replace(/\s/g, "").replace(/\.$/, "")} ${time}`;
};
const dDay = (to: Date, from: Date) =>
  Math.max(0, Math.ceil((to.getTime() - from.getTime()) / 86_400_000));
/** 카드 코드 뒤 주제 조사 — 영어로 읽는다(「씨원은」·「씨투는」, 시안 「C3는」) */
const topic = (code: string) => `${code}${code === "C1" ? "은" : "는"}`;

/** 시안 `st-*` 클래스 */
const STATE_CLASS: Record<CreditCardState, string> = {
  negotiating: styles.stPend,
  locked: styles.stLock,
  available: styles.stReady,
  scheduled: styles.stSched,
  delivered: styles.stSent,
  confirmed: styles.stOk,
  expired: styles.stExp,
  award: `${styles.stLock} ${styles.stAward}`,
  awarded: `${styles.stAward} ${styles.fin}`,
};

const Mono = ({ children }: { children: ReactNode }) => (
  <span className="mono">{children}</span>
);

export default async function Page() {
  const { viewer, access } = await guardPage(
    "dashboardCredits",
    "/dashboard/credits",
  );
  if (!viewer.entry || !viewer.season) notFound();

  const view = access.ok
    ? await loadCreditCenter({
        entryId: viewer.entry.id,
        seasonId: viewer.season.id,
        phase: viewer.season.phase,
        status: viewer.entry.status,
      })
    : null;

  const eliminated = viewer.entry.status === EntryStatus.eliminated;
  /*
    못 넘은 게이트 — 헤더·허브와 같은 규칙(access-policy `gateOf`). s5를 안 내고
    떨어진 팀은 진도가 s3·s4인 채라 「진도가 s5면 2차」로는 1차로 읽혔다.
  */
  const failedGate = gateOf(viewer.entry.stage) === StageKey.s5 ? 2 : 1;
  const pane = view
    ? creditsPane({ season: view.season, eliminated, cards: view.cards })
    : null;
  const next = view
    ? nextUnlock({
        season: view.season,
        eliminated,
        failedGate,
        cards: view.cards,
      })
    : null;
  const now = devNow();

  return (
    <CreditsToast>
      <div data-probe="credits" data-state={pane ?? "none"}>
        {!access.ok ? (
          <div className={`${hub.wbar} ${hub.wbarWarn}`} role="status">
            <Icon name="warn" fixed />
            <span>
              <Clauses text={access.message} />
            </span>
          </div>
        ) : null}

        <h2 className={hub.h1}>{CREDITS_HEAD.title}</h2>
        <p className={hub.sub}>
          <Clauses text={CREDITS_HEAD.sub} />
        </p>

        {view && next ? (
          <>
            <Note view={view} eliminated={eliminated} failedGate={failedGate} />

            {/* 요약 셋 — 시안 `#crSum` */}
            <div className={styles.sum}>
              <Card>
                <small>{CREDITS_SUM.opened}</small>
                <span className="score">
                  {view.opened}
                  <i>/{view.total}</i>
                </span>
              </Card>
              <Card>
                <small>{CREDITS_SUM.value}</small>
                <span className="score" style={{ color: "var(--blue)" }}>
                  {creditValueTotal(view.cards)}
                </span>
              </Card>
              <Card>
                <small>{CREDITS_SUM.next}</small>
                <div className={styles.nx}>
                  <Next next={next} />
                </div>
              </Card>
            </div>

            {/* 레일 — 시안 `#crRail`. 라임 선은 마지막으로 열린 카드까지 */}
            <Rail
              className={styles.rail}
              last={view.cards
                .map((c) => isOpenedCard(c.state, c.unlocked))
                .lastIndexOf(true)}
            >
              {view.cards.map((card, i) => (
                <CreditCard
                  key={card.kind}
                  card={card}
                  index={i}
                  award={view.award}
                  buildStartAt={view.buildStartAt}
                  now={now}
                />
              ))}
            </Rail>

            <p className={styles.foot}>
              {CREDITS_FOOT.map((line, i) => (
                <span key={line.b}>
                  {i > 0 ? <br /> : null}
                  <b>{line.b}</b>
                  <Clauses text={line.text} />
                </span>
              ))}
            </p>
          </>
        ) : null}
        <ClauseFit />
      </div>
    </CreditsToast>
  );
}

/**
 * 제목 아래 한 줄 — ⑥ 경고줄, ⑦ 안내줄. 나머지 판은 비어 있다.
 * ⚠️ 줄은 flex라 절(Clauses)을 `<span>` 하나에 담는다 — 안 담으면 절마다 flex
 * 항목이 되어 나란히 선다.
 */
function Note({
  view,
  eliminated,
  failedGate,
}: {
  view: NonNullable<Awaited<ReturnType<typeof loadCreditCenter>>>;
  eliminated: boolean;
  failedGate: 1 | 2;
}) {
  if (view.season === "over") {
    return (
      <div className={`${hub.infoStrip} ${styles.strip}`} role="status">
        <Icon name="info" fixed />
        <span>
          <Clauses text={CREDITS_NOTE.over} />
        </span>
      </div>
    );
  }
  if (eliminated) {
    const received = view.cards
      .filter((c) => isDeliveredCard(c.state))
      .map((c) => c.code);
    const text = (
      received.length ? CREDITS_NOTE.tester : CREDITS_NOTE.testerNone
    )
      /* 조사가 숫자를 따른다 — 「1을」·「2를」 */
      .replace("{gate}", failedGate === 2 ? "2를" : "1을")
      .replace("{cards}", received.join(", "));
    return (
      <div
        className={`${hub.wbar} ${hub.wbarWarn} ${styles.strip}`}
        role="status"
      >
        <Icon name="warn" fixed />
        <span>
          <Clauses text={text} />
        </span>
      </div>
    );
  }
  return null;
}

/** 「다음 언락」 칸 — 시안 `nx` */
function Next({ next }: { next: ReturnType<typeof nextUnlock> }) {
  switch (next.kind) {
    case "pre":
      return (
        <>
          {CREDITS_NEXT.pre[0]}
          <Mono>{CREDITS_NEXT.pre[1]}</Mono>
          {CREDITS_NEXT.pre[2]}
        </>
      );
    case "scheduled":
      return next.at ? (
        <>
          {CREDITS_NEXT.scheduled[0].replace("{code}", topic(next.card.code))}
          <Mono>{day(next.at)}</Mono>
          {CREDITS_NEXT.scheduled[1]}
        </>
      ) : (
        CREDITS_NEXT.scheduledGate.replace("{code}", topic(next.card.code))
      );
    case "unlock": {
      const line = CREDITS_UNLOCK[next.card.unlockEvent];
      return (
        <>
          {next.via
            ? CREDITS_NEXT.negotiatingOpen.replace("{code}", next.via.code)
            : null}
          <b>{line.key}</b>
          {line.rest
            .replace("{code}", next.card.code)
            .replace("{title}", next.card.title)}
        </>
      );
    }
    case "tester": {
      const line = next.next ? CREDITS_NEXT.tester : CREDITS_NEXT.testerNone;
      return (
        <>
          <b>{line[0].replace("{gate}", String(next.gate))}</b>
          {line[1].replace("{code}", next.next?.code ?? "")}
        </>
      );
    }
    case "over":
      return next.until ? (
        <>
          {CREDITS_NEXT.over[0]}
          <Mono>{day(next.until)}</Mono>
          {CREDITS_NEXT.over[1]}
        </>
      ) : (
        CREDITS_NEXT.overNone
      );
    case "done":
      return CREDITS_NEXT.done;
  }
}

/** 레일의 노드 — 시안 `crNode` */
function Node({ card }: { card: CreditCardView }) {
  switch (card.state) {
    case "locked":
    case "award":
      return <Icon name="lock" />;
    case "scheduled":
      return <Icon name="clock" />;
    case "delivered":
    case "confirmed":
      return <Icon name="check" />;
    case "expired":
      return <Icon name="ban" />;
    case "awarded":
      return "🏆";
    default:
      return card.code;
  }
}

function CreditCard({
  card,
  index,
  award,
  buildStartAt,
  now,
}: {
  card: CreditCardView;
  index: number;
  award: { label: string; at: Date | null } | null;
  buildStartAt: Date | null;
  now: Date;
}) {
  const badge = creditBadge(card.state, card.unlocked);
  const pend = card.state === "negotiating";
  const awardCard = card.kind === CreditKind.c4;
  /*
    C1의 지급 시점은 그 팀의 빌드 시작일(게이트 1 통과)이다 — 카드의 지급 예정일이
    아니다(credits.ts `releaseDue`). 게이트 1에서 떨어졌어도 받은 C1은 보낸 날로 적는다.
  */
  const c1At = card.kind === CreditKind.c1 ? (buildStartAt ?? card.deliveredAt) : null;

  return (
    <Card className={`${styles.cr} ${STATE_CLASS[card.state]}`} data-i={index}>
      <span className={styles.nd}>
        <Node card={card} />
      </span>

      <div className={styles.hd}>
        <span className={styles.kd}>{card.code}</span>
        <h3>{card.title}</h3>
        <Badge tone={badge.tone} dashed={badge.dashed}>
          {badge.label}
        </Badge>
        <span className={styles.sp}>
          {card.sponsorName && !pend ? (
            <span className={styles.wmk}>
              <i>{card.sponsorMark ?? card.sponsorName.slice(0, 1)}</i>
              {card.sponsorName}
            </span>
          ) : (
            <span className={styles.wmk}>
              <i>?</i>
              {T.sponsorNone}
            </span>
          )}
        </span>
      </div>

      {card.description ? (
        <p className={styles.ds}>
          <Clauses text={card.description} />
        </p>
      ) : null}

      {card.unlocked ? (
        <span className={`${styles.cond} ${styles.ok}`}>
          <Icon name="check" />
          {card.condition}
          {card.unlockedAt ? <Mono>{day(card.unlockedAt)}</Mono> : null}
        </span>
      ) : (
        <span className={styles.cond}>
          <Icon name="lock" />
          {T.condLocked}
          {card.condition}
        </span>
      )}

      <div className={styles.meta}>
        <div>
          <small>{T.meta.value}</small>
          {pend || !card.value ? (
            <span className={styles.k}>{T.negotiating}</span>
          ) : awardCard ? (
            <span className={styles.k}>{card.value}</span>
          ) : (
            <>
              <b className={styles.lime}>{card.value}</b>{" "}
              <span
                className={styles.k}
                style={{ fontSize: "12px", color: "var(--muted)" }}
              >
                {T.worth}
              </span>
            </>
          )}
        </div>
        <div>
          <small>{T.meta.release}</small>
          {card.kind === CreditKind.c1 ? (
            c1At ? (
              <>
                <span className={styles.k}>{T.releaseLabel}</span>{" "}
                <b>{day(c1At)}</b>
              </>
            ) : (
              <span className={styles.k}>{T.releaseGate}</span>
            )
          ) : (
            <span className={styles.k}>
              {card.releaseDate
                ? day(card.releaseDate)
                : T.releaseImmediate[card.unlockEvent]}
            </span>
          )}
        </div>
        <div>
          <small>{T.meta.valid}</small>
          {pend || !card.validUntil ? (
            <span className={styles.k}>{T.none}</span>
          ) : (
            <b>~ {day(card.validUntil)}</b>
          )}
        </div>
      </div>

      <Body card={card} award={award} now={now} />
    </Card>
  );
}

/** 상태별 행동 줄 — 시안 `crCard`의 `body` */
function Body({
  card,
  award,
  now,
}: {
  card: CreditCardView;
  award: { label: string; at: Date | null } | null;
  now: Date;
}) {
  const how = card.howtoUrl ? (
    <a
      className={styles.lnk}
      href={card.howtoUrl}
      target="_blank"
      rel="noreferrer"
    >
      {T.ready.how}
    </a>
  ) : null;

  switch (card.state) {
    case "negotiating":
      if (card.kind === CreditKind.c4) {
        return (
          <div className={styles.act}>
            <span className={styles.when} style={{ marginLeft: 0 }}>
              <Clauses text={T.pendAward} />
            </span>
          </div>
        );
      }
      return (
        <>
          <Fallback card={card} />
          <div className={styles.act}>
            {card.fallbackUrl ? (
              <AnchorButton
                variant="outline"
                href={card.fallbackUrl}
                target="_blank"
                rel="noreferrer"
              >
                {T.pend.guide}
              </AnchorButton>
            ) : null}
            <Link className={styles.lnk} href="/notifications">
              {T.pend.status}
            </Link>
            {card.unlocked ? (
              <span className={styles.when}>
                <Clauses text={T.pend.open} />
              </span>
            ) : null}
          </div>
        </>
      );

    case "locked":
      return (
        <div className={styles.act}>
          <Button variant="ghost" disabled>
            <Icon name="lock" /> {T.lock.claim}
          </Button>
          <a className={styles.lnk} href="/rules">
            {T.lock.cond}
          </a>
        </div>
      );

    case "scheduled":
      return (
        <>
          <div className={styles.sched}>
            <Icon name="clock" />
            {card.kind === CreditKind.c1 || !card.releaseDate ? (
              T.sched.gate
            ) : (
              <>
                {T.sched.line[0]}
                <b className="mono">{day(card.releaseDate)}</b>
                {T.sched.line[1]}
                <span className={styles.dd}>D-{dDay(card.releaseDate, now)}</span>
              </>
            )}
          </div>
          <div className={styles.act}>
            <a className={styles.lnk} href="/settings">
              {T.sched.mail}
            </a>
            <span className={styles.when}>
              <Clauses text={T.sched.when} />
            </span>
          </div>
        </>
      );

    case "available":
      return (
        <ClaimForm offerId={card.offerId} className={styles.act}>
          {how}
          <span className={styles.when}>
            <Clauses text={T.ready.when} />
          </span>
        </ClaimForm>
      );

    case "delivered":
    case "confirmed": {
      const confirmed = card.state === "confirmed";
      return (
        <>
          {card.code_ ? (
            <div className={styles.code}>
              <span className={styles.v}>
                {card.code_.masked
                  ? maskCreditCode(card.code_.value)
                  : card.code_.value}
              </span>
              <span className={styles.cp}>
                <CopyButton value={card.code_.value} />
                {card.howtoUrl ? (
                  <a
                    className={styles.lnk}
                    href={card.howtoUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: "12.5px",
                      color: "var(--muted)",
                      textDecoration: "underline",
                      textUnderlineOffset: "3px",
                      cursor: "pointer",
                    }}
                  >
                    {T.sent.how}
                  </a>
                ) : null}
              </span>
              {card.deliveredAt ? (
                <span className={styles.sent}>
                  {T.sent.line}
                  <Mono>{minute(card.deliveredAt)}</Mono>
                  {card.redeemNote ? `, ${card.redeemNote}` : null}
                </span>
              ) : null}
            </div>
          ) : null}
          {card.offerId ? (
            <AppliedCheck
              offerId={card.offerId}
              applied={confirmed}
              className={`${styles.okrow} ${confirmed ? styles.on : ""}`}
              boxClassName={`${styles.chk} ${confirmed ? styles.on : ""}`}
            >
              {confirmed ? T.sent.confirmed : T.sent.applied}
            </AppliedCheck>
          ) : null}
        </>
      );
    }

    case "expired":
      return (
        <div className={styles.act}>
          <span className={styles.when} style={{ marginLeft: 0 }}>
            <Clauses
              text={
                !card.sponsorName
                  ? T.exp.noSponsor
                  : card.unlocked
                    ? T.exp.opened
                    : T.exp.never
              }
            />
          </span>
        </div>
      );

    case "award":
      return (
        <div className={styles.act}>
          <span className={styles.when} style={{ marginLeft: 0 }}>
            <Clauses text={T.award} />
          </span>
        </div>
      );

    case "awarded":
      return (
        <div className={styles.act}>
          {award ? <Badge tone="lime">{award.label}</Badge> : null}
          <LinkButton variant="outline" href="/dashboard/judgments">
            {T.awarded.guide}
          </LinkButton>
          <span className={styles.when}>
            {T.awarded.when[0]}
            {award?.at ? <Mono>{day(award.at)}</Mono> : null}
            {T.awarded.when[1]}
          </span>
        </div>
      );
  }
}

/** 0원 스타트 스택 — 시안 `.fb`. 스폰서가 없어도 같은 루트를 갈 수 있다는 안내 */
function Fallback({ card }: { card: CreditCardView }) {
  if (!card.fallbackItems.length) return null;
  return (
    <div className={styles.fb}>
      <div className={styles.t}>
        {T.fallback.title}
        <Mono>{T.fallback.zero}</Mono>
        {T.fallback.stack}
        <span style={{ fontWeight: 400, color: "var(--faint)" }}>
          {T.fallback.sub}
        </span>
      </div>
      <ul>
        {card.fallbackItems.map((item) => (
          <li key={item.name}>
            {item.name}
            {item.note ? <small>{item.note}</small> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
