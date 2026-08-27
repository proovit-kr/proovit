import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/Badge";
import { EntryStatus } from "@/generated/prisma/enums";
import { guardPage } from "@/lib/access";
import {
  creditBadge,
  isDeliveredCard,
  maskCreditCode,
  type CreditCardState,
} from "@/lib/credits";
import { loadCreditCenter, type CreditCardView } from "@/lib/credits-store";
import { isArchived } from "@/lib/season-phase";

import { AppliedToggle, ClaimButton, CopyButton } from "./CreditActions";

import styles from "./credits.module.css";

/*
  혜택과 크레딧 — 13 크레딧 센터 설계서 v0.1 7장 「참가자 대시보드 ③ 혜택 탭」.

  카드 4장이 세로 레일에 걸린다. 순서가 곧 시즌의 진행이라 그리드가 아니라
  레일이다 — C1이 열리고 C2가 열리는 흐름이 화면에 보여야 "스테이지를 통과하면
  열린다"는 규칙이 설명 없이 읽힌다.

  ⚠️ **예상 가치를 합산하지 않는다.** `credit_offers.value`는 "$75 상당" 같은
  표기 문자열이고 통화도 스폰서마다 다르다. 시안은 합계("$125")를 보여주지만
  그 숫자를 만들려면 우리가 환산을 지어내야 한다 — 받은 카드의 표기를 그대로
  나열한다(CLAUDE.md 규칙 1).

  ⚠️ 문체는 해요체다. 중간점과 줄표를 쓰지 않는다(설계서 7장).
*/

export const metadata: Metadata = {
  title: "혜택·크레딧",
  robots: { index: false, follow: false },
};

const DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
});

/** 카드 상태별 바깥 테두리·노드 모양. CSS Module 클래스 이름이 곧 상태다 */
const STATE_CLASS: Record<CreditCardState, string> = {
  negotiating: styles.stPending,
  locked: styles.stLocked,
  available: styles.stReady,
  scheduled: styles.stScheduled,
  delivered: styles.stDelivered,
  confirmed: styles.stConfirmed,
  expired: styles.stExpired,
  award: styles.stLocked,
  awarded: styles.stAwarded,
};

/** 레일 노드에 찍는 것. 열리기 전에는 자물쇠, 열리면 카드 코드 */
function nodeMark(card: CreditCardView): string {
  switch (card.state) {
    case "locked":
    case "award":
      return "🔒";
    case "scheduled":
      return "⏰";
    case "delivered":
    case "confirmed":
      return "✓";
    case "expired":
      return "—";
    case "awarded":
      return "🏆";
    default:
      return card.code;
  }
}

export default async function Page() {
  const { viewer, access } = await guardPage(
    "dashboardCredits",
    "/dashboard/credits",
  );
  if (!viewer.entry || !viewer.season) notFound();

  /*
    진도 미달(409)이면 카드를 읽지 않는다. 잠긴 화면에 카드 넉 장을 다 그려두면
    "지금 받을 수 있는 것"과 "언젠가 받을 것"이 구분되지 않는다.
  */
  const view = access.ok
    ? await loadCreditCenter({
        entryId: viewer.entry.id,
        seasonId: viewer.season.id,
        stage: viewer.entry.stage,
      })
    : null;

  const seasonOver = isArchived(viewer.season.phase);
  const eliminated = viewer.entry.status === EntryStatus.eliminated;

  const received =
    view?.cards.filter((c) => isDeliveredCard(c.state) && c.value) ?? [];
  /* 다음에 열릴 것 하나. 시상 카드는 여기 세지 않는다 — 받는 것이 아니다 */
  const nextCard = view?.cards.find(
    (c) =>
      (c.state === "locked" || c.state === "negotiating") && c.kind !== "c4",
  );

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <h1 className={styles.title}>혜택과 크레딧</h1>
        <p className={styles.lead}>
          혜택은 스테이지를 통과할 때 열려요. 크레딧은 빌드 시작일에 보내드려요.
        </p>

        {!access.ok ? (
          <p className={styles.locked}>
            {access.message} s1을 제출하면 첫 카드가 열려요.
          </p>
        ) : null}

        {access.ok && eliminated ? (
          <p className={styles.noteWarn} role="status">
            게이트를 통과하지 못해 다음 카드는 열리지 않아요. 이미 받은 크레딧은
            유효기간까지 그대로 쓸 수 있어요.
          </p>
        ) : null}

        {access.ok && seasonOver ? (
          <p className={styles.noteInfo} role="status">
            시즌이 끝났어요. 받은 코드는 유효기간까지 그대로 쓰고, 열리지 않은
            카드는 만료됐어요.
          </p>
        ) : null}
      </header>

      {view ? (
        <>
          <div className={styles.summary}>
            <div className={`${styles.tile} ${styles.tileLime}`}>
              <p className={styles.tileLabel}>열린 혜택</p>
              <p className={styles.tileValue}>
                {view.opened}
                <span className={styles.tileOf}>/{view.total}</span>
              </p>
            </div>

            <div className={`${styles.tile} ${styles.tileBlue}`}>
              <p className={styles.tileLabel}>받은 크레딧</p>
              {/*
                합계가 아니라 나열이다. 표기 통화가 섞여 있어 더할 수 없다 —
                머리 주석 참조.
              */}
              <p className={styles.tileValue}>
                {received.length ? (
                  received.map((c) => c.value).join("  ")
                ) : (
                  <span className={styles.tileNone}>아직 없어요</span>
                )}
              </p>
            </div>

            <div className={`${styles.tile} ${styles.tileViolet}`}>
              <p className={styles.tileLabel}>다음 언락</p>
              <p className={styles.tileNext}>
                {nextCard ? (
                  nextCard.state === "negotiating" ? (
                    <>
                      {nextCard.code} {nextCard.title}은 스폰서 협의 중이라
                      폴백으로 열려 있어요
                    </>
                  ) : (
                    <>
                      <strong className={styles.nextCond}>
                        {nextCard.condition}
                      </strong>
                      을 마치면 {nextCard.code} {nextCard.title}이 열려요
                    </>
                  )
                ) : (
                  "열 수 있는 카드를 다 열었어요"
                )}
              </p>
            </div>
          </div>

          <ol className={styles.rail}>
            {view.cards.map((card) => (
              <li key={card.kind} className={styles.railItem}>
                <span className={styles.node} aria-hidden>
                  {nodeMark(card)}
                </span>
                <Card card={card} />
              </li>
            ))}
          </ol>

          <div className={styles.foot}>
            <p>
              <strong>팀당 1회 발급.</strong> 코드는 스폰서가 만들고 프루빗은
              전달과 확인만 해요. 코드 발급을 위해 스폰서에 이름과 이메일을
              넘기는 건 참가 신청 때 따로 동의한 팀만이에요.
            </p>
            <p>
              <strong>상금과는 별개.</strong> C1부터 C3까지는 참가를 돕는
              자원이고, 시상 크레딧만 상금 규정이 적용돼요. 자세한 건{" "}
              <Link href="/rules" className={styles.footLink}>
                시즌 운영 규칙
              </Link>
              에 있어요.
            </p>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Card({ card }: { card: CreditCardView }) {
  const badge = creditBadge(card.state, card.unlocked);

  return (
    <article className={`${styles.card} ${STATE_CLASS[card.state]}`}>
      <div className={styles.cardHead}>
        <span className={styles.kind}>{card.code}</span>
        <h2 className={styles.cardTitle}>{card.title}</h2>
        <Badge tone={badge.tone} dashed={badge.dashed}>
          {badge.label}
        </Badge>
        <span className={styles.sponsor}>
          {card.sponsorName ? (
            <>
              <span className={styles.sponsorMark} aria-hidden>
                {card.sponsorName.slice(0, 1)}
              </span>
              {card.sponsorName}
            </>
          ) : (
            <>
              <span className={styles.sponsorMarkNone} aria-hidden>
                ?
              </span>
              스폰서 미정
            </>
          )}
        </span>
      </div>

      {card.description ? (
        <p className={styles.desc}>{card.description}</p>
      ) : null}

      <p className={card.unlocked ? styles.condMet : styles.cond}>
        <span aria-hidden>{card.unlocked ? "✓" : "🔒"}</span>
        {card.unlocked ? card.condition : `열리는 조건, ${card.condition}`}
      </p>

      <dl className={styles.meta}>
        <div>
          <dt>예상 가치</dt>
          <dd className={card.value ? styles.metaLime : undefined}>
            {card.value ?? "협의 중"}
          </dd>
        </div>
        <div>
          <dt>지급 시점</dt>
          <dd>{card.releaseDate ? DATE.format(card.releaseDate) : "조건 충족 즉시"}</dd>
        </div>
        <div>
          <dt>유효기간</dt>
          <dd>{card.validUntil ? `~ ${DATE.format(card.validUntil)}` : "협의 중"}</dd>
        </div>
      </dl>

      <CardBody card={card} />
    </article>
  );
}

function CardBody({ card }: { card: CreditCardView }) {
  switch (card.state) {
    case "negotiating":
      return (
        <>
          <Fallback card={card} />
          <p className={styles.hint}>
            {card.unlocked
              ? "조건은 채웠어요. 스폰서가 확정되면 바로 열려요."
              : "스폰서가 확정되면 여기에 코드가 들어와요."}
          </p>
        </>
      );

    case "locked":
      return (
        <p className={styles.hint}>
          {card.condition}을 마치면 열려요. 조건은{" "}
          <Link href="/rules" className={styles.footLink}>
            시즌 운영 규칙
          </Link>
          의 혜택 항목에 있어요.
        </p>
      );

    case "available":
      return card.offerId ? (
        <ClaimButton offerId={card.offerId} />
      ) : (
        <p className={styles.hint}>곧 열려요.</p>
      );

    case "scheduled":
      return (
        <p className={styles.scheduled}>
          <span aria-hidden>⏰</span>
          빌드 시작일{" "}
          <strong>
            {card.releaseDate ? DATE.format(card.releaseDate) : "개시일"}
          </strong>
          에 이메일로 보내드려요. 크레딧 유효기간이 받는 순간부터 도는 탓에 미리
          드리지 않아요.
        </p>
      );

    case "delivered":
    case "confirmed":
      return (
        <>
          {card.code_ ? (
            <div className={styles.codeBox}>
              <code className={styles.codeValue}>
                {card.code_.masked
                  ? maskCreditCode(card.code_.value)
                  : card.code_.value}
              </code>
              {card.code_.masked ? null : (
                <CopyButton value={card.code_.value} />
              )}
              {card.deliveredAt ? (
                <span className={styles.codeSent}>
                  {DATE.format(card.deliveredAt)} 발송
                </span>
              ) : null}
            </div>
          ) : null}
          {card.offerId ? (
            <AppliedToggle
              offerId={card.offerId}
              applied={card.state === "confirmed"}
            />
          ) : null}
        </>
      );

    case "expired":
      return (
        <p className={styles.hint}>
          {card.sponsorName
            ? "유효기간이 끝났어요."
            : "스폰서 협의가 안 돼 폴백으로 운영됐어요. 시즌 종료로 닫혔어요."}
        </p>
      );

    case "award":
      return (
        <p className={styles.hint}>
          최종 심사가 확정된 뒤에 안내돼요. 여기서 받는 게 아니라 시상 절차로
          가요.
        </p>
      );

    case "awarded":
      return (
        <p className={styles.hint}>
          시상이 확정됐어요. 상금 규정과 세금 안내가 함께 가요.
        </p>
      );
  }
}

/** 0원 스타트 스택. 스폰서가 없어도 같은 루트를 갈 수 있다는 안내다 */
function Fallback({ card }: { card: CreditCardView }) {
  if (!card.fallbackItems.length && !card.fallbackUrl) return null;

  return (
    <div className={styles.fallback}>
      <p className={styles.fallbackTitle}>
        폴백, <span className={styles.mono}>₩0</span> 스타트 스택
        <span className={styles.fallbackSub}>같은 루트를 무료 티어로 가요</span>
      </p>
      {card.fallbackItems.length ? (
        <ul className={styles.fallbackList}>
          {card.fallbackItems.map((item) => (
            <li key={item.name}>
              {item.name}
              {item.note ? (
                <span className={styles.fallbackNote}>{item.note}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {card.fallbackUrl ? (
        <a
          className={styles.footLink}
          href={card.fallbackUrl}
          target="_blank"
          rel="noreferrer"
        >
          폴백 가이드 열기
        </a>
      ) : null}
    </div>
  );
}
