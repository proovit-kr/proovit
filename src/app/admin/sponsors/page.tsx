import type { Metadata } from "next";

import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import {
  CreditClaimStatus,
  CreditDelivery,
  CreditKind,
  CreditOfferStatus,
  CreditUnlockEvent,
} from "@/generated/prisma/enums";
import { guardPage } from "@/lib/access";
import {
  CLAIM_STATUS_LABEL,
  CREDIT_CARDS,
  CREDIT_CARD_BY_KIND,
  DELIVERY_LABEL,
  OFFER_STATUS_LABEL,
} from "@/lib/credits";
import { loadAdminCreditConsole } from "@/lib/credits-store";
import { prisma } from "@/lib/prisma";

import {
  CodeUploadForm,
  ManualDeliverForm,
  OfferForm,
  type OfferDefaults,
} from "./SponsorForms";

import styles from "./sponsors.module.css";

/*
  스폰서 크레딧 — 13 크레딧 센터 설계서 v0.1 7장 「관리 콘솔 P0」.

  화면이 셋으로 나뉜다. 시안은 탭이지만 여기서는 세 단으로 쌓는다 — 운영자가
  하는 일이 「카드를 고치고, 누가 받았는지 보고, 안 받은 팀에 보내는」 한 흐름이라
  탭으로 끊으면 왕복이 생긴다. 화면 하나에 다 있으면 스크롤 한 번이다.

  ⚠️ 발송 이력을 여기서 따로 쌓지 않는다. 정본은 감사 로그다 — 같은 사실을
  두 곳에 적으면 둘이 갈라지고, 갈라진 순간 둘 다 근거가 못 된다.

  ⚠️ 카드 4장은 항상 4장으로 그린다. 아직 안 만든 카드도 자리를 비우지 않는다 —
  「C3를 안 만들었다」와 「C3가 없다」는 운영자에게 다른 말이다.
*/

export const metadata: Metadata = {
  title: "스폰서·크레딧",
  robots: { index: false, follow: false },
};

const DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
});
const WHEN = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** date input이 먹는 모양. 표시가 아니라 폼 값이라 KST 기준으로 자른다 */
function toDateInput(value: Date | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

const CLAIM_TONE: Record<CreditClaimStatus, "lime" | "teal" | "neutral"> = {
  [CreditClaimStatus.available]: "lime",
  [CreditClaimStatus.scheduled]: "lime",
  [CreditClaimStatus.delivered]: "lime",
  [CreditClaimStatus.confirmed]: "teal",
  [CreditClaimStatus.expired]: "neutral",
};

export default async function Page() {
  const { viewer } = await guardPage("adminSponsors", "/admin/sponsors");
  if (!viewer.season) {
    return (
      <section className={styles.root}>
        <EmptyState
          title="현재 시즌이 없습니다"
          detail="시즌을 먼저 만들어야 혜택 카드를 등록할 수 있습니다."
        />
      </section>
    );
  }

  const [console_, sponsors] = await Promise.all([
    loadAdminCreditConsole(viewer.season.id),
    prisma.sponsor.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  /* 발송 이력 = 감사 로그에서 credit_로 시작하는 것 */
  const logs = await prisma.auditLog.findMany({
    where: { action: { startsWith: "credit_" } },
    orderBy: { id: "desc" },
    take: 40,
    select: {
      id: true,
      action: true,
      reason: true,
      createdAt: true,
      actor: { select: { nickname: true } },
    },
  });

  const offerByKind = new Map(console_.offers.map((o) => [o.kind, o]));
  const claimKinds = CREDIT_CARDS.filter((c) => c.kind !== CreditKind.c4);

  return (
    <section className={styles.root}>
      <header className={styles.head}>
        <h1 className={styles.title}>스폰서 크레딧</h1>
        <p className={styles.sub}>
          혜택 카드 등록, 코드 풀 관리, 팀별 발급 처리. 쓰기 작업은 사유가
          필수이고 감사 로그에 남습니다.
        </p>
        {!viewer.season.flags.credits ? (
          <p className={styles.warnStrip}>
            참가자 쪽 혜택 탭(credit_center)이 꺼져 있습니다. 여기서 등록한
            카드는 아직 참가자에게 보이지 않습니다.
          </p>
        ) : null}
      </header>

      <div className={styles.kpi}>
        <div>
          <p className={styles.kpiLabel}>활성 혜택</p>
          <p className={styles.kpiValue}>
            {console_.summary.activeOffers}
            <span>/{console_.summary.totalOffers}</span>
          </p>
        </div>
        <div>
          <p className={styles.kpiLabel}>코드 잔여</p>
          <p className={styles.kpiValue}>{console_.summary.codesRemaining}</p>
        </div>
        <div>
          <p className={styles.kpiLabel}>발급 완료 팀</p>
          <p className={styles.kpiValue}>{console_.summary.deliveredTeams}</p>
        </div>
        <div>
          <p className={styles.kpiLabel}>발급 확인 팀</p>
          <p className={styles.kpiValue}>{console_.summary.confirmedTeams}</p>
        </div>
      </div>

      {/* ① 혜택 설정 ─────────────────────────────────────────── */}
      <section className={styles.block}>
        <h2 className={styles.blockTitle}>혜택 설정</h2>

        <div className={styles.scroller}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">카드</th>
                <th scope="col">스폰서</th>
                <th scope="col">상태</th>
                <th scope="col">언락 · 지급 방식</th>
                <th scope="col">지급 시점 · 유효기간</th>
                <th scope="col">코드 잔여</th>
              </tr>
            </thead>
            <tbody>
              {CREDIT_CARDS.map((spec) => {
                const offer = offerByKind.get(spec.kind);
                return (
                  <tr key={spec.kind} className={offer ? "" : styles.rowEmpty}>
                    <td className={styles.mono}>
                      {spec.code}
                      <span className={styles.cellSub}>{spec.title}</span>
                    </td>
                    <td>
                      {offer?.sponsorName ?? (
                        <span className={styles.dim}>미정</span>
                      )}
                    </td>
                    <td>
                      {offer ? (
                        <Badge
                          tone={
                            offer.status === CreditOfferStatus.active
                              ? "lime"
                              : "neutral"
                          }
                          dashed={
                            offer.status === CreditOfferStatus.negotiating
                          }
                        >
                          {OFFER_STATUS_LABEL[offer.status]}
                        </Badge>
                      ) : (
                        <Badge tone="neutral" dashed>
                          미등록
                        </Badge>
                      )}
                    </td>
                    <td>
                      <span className={styles.event}>{spec.unlockEvent}</span>
                      <span className={styles.cellSub}>
                        {offer
                          ? DELIVERY_LABEL[offer.deliveryMethod]
                          : DELIVERY_LABEL[CreditDelivery.manual]}
                      </span>
                    </td>
                    <td className={styles.mono}>
                      {offer?.releaseDate
                        ? DATE.format(offer.releaseDate)
                        : "조건 즉시"}
                      <span className={styles.cellSub}>
                        {offer?.validUntil
                          ? `~ ${DATE.format(offer.validUntil)}`
                          : "미정"}
                      </span>
                    </td>
                    <td className={styles.mono}>
                      {offer && offer.deliveryMethod === CreditDelivery.code_pool
                        ? `${offer.pool.remaining} / ${offer.pool.total}`
                        : offer
                          ? <span className={styles.dim}>코드 없음</span>
                          : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className={styles.editors}>
          {CREDIT_CARDS.map((spec) => {
            const offer = offerByKind.get(spec.kind);
            const defaults: OfferDefaults = {
              kind: spec.kind,
              status: offer?.status ?? CreditOfferStatus.negotiating,
              sponsorId: offer?.sponsorId ?? null,
              unlockEvent: (offer?.unlockEvent ??
                spec.unlockEvent) as CreditUnlockEvent,
              deliveryMethod: offer?.deliveryMethod ?? CreditDelivery.manual,
              releaseDate: toDateInput(offer?.releaseDate ?? null),
              validUntil: toDateInput(offer?.validUntil ?? null),
              inviteUrl: offer?.inviteUrl ?? "",
              howtoUrl: offer?.howtoUrl ?? "",
              redeemNote: offer?.redeemNote ?? "",
              description: offer?.description ?? "",
              value: offer?.value ?? "",
              fallbackUrl: offer?.fallbackUrl ?? "",
            };

            return (
              <div key={spec.kind} className={styles.editor}>
                <OfferForm defaults={defaults} sponsors={sponsors} />
                {offer && offer.deliveryMethod === CreditDelivery.code_pool ? (
                  <CodeUploadForm offerId={offer.id} pool={offer.pool} />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* ② 팀별 발급 현황 ────────────────────────────────────── */}
      <section className={styles.block}>
        <h2 className={styles.blockTitle}>팀별 발급 현황</h2>

        {console_.claims.length === 0 ? (
          <EmptyState
            title="아직 참가팀이 없습니다"
            detail="신청이 접수되면 팀마다 카드 상태가 여기에 생깁니다."
          />
        ) : (
          <>
            <div className={styles.scroller}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">팀</th>
                    <th scope="col">진도</th>
                    {claimKinds.map((spec) => (
                      <th key={spec.kind} scope="col">
                        {spec.code}
                      </th>
                    ))}
                    <th scope="col">최근 발송</th>
                    <th scope="col">정보 동의</th>
                    <th scope="col" />
                  </tr>
                </thead>
                <tbody>
                  {console_.claims.map((row) => (
                    <tr key={row.entryId}>
                      <th scope="row" className={styles.teamCell}>
                        {row.teamName}
                        <span className={styles.cellSub}>{row.ideaTitle}</span>
                      </th>
                      <td className={styles.mono}>{row.stage}</td>

                      {row.cells.map((cell) => (
                        <td key={cell.kind}>
                          {cell.status ? (
                            <Badge tone={CLAIM_TONE[cell.status]}>
                              {CLAIM_STATUS_LABEL[cell.status]}
                            </Badge>
                          ) : cell.negotiating ? (
                            <Badge tone="neutral" dashed>
                              협의 중
                            </Badge>
                          ) : (
                            <Badge tone="neutral">잠금</Badge>
                          )}
                        </td>
                      ))}

                      <td className={styles.mono}>
                        {row.lastDeliveredAt
                          ? WHEN.format(row.lastDeliveredAt)
                          : "—"}
                      </td>
                      <td>
                        {row.sponsorConsent ? (
                          <span className={styles.consentOk}>동의</span>
                        ) : (
                          <span className={styles.dim}>없음</span>
                        )}
                      </td>
                      <td>
                        {/*
                          수동 발급은 「발급 가능」인 카드에만 뜬다. 잠긴 팀에
                          보낼 수 있게 하면 언락 규칙이 화면에서 뚫린다.
                        */}
                        {row.cells
                          .filter(
                            (c) =>
                              c.status === CreditClaimStatus.available ||
                              c.status === CreditClaimStatus.scheduled,
                          )
                          .map((cell) => {
                            const offer = offerByKind.get(cell.kind);
                            if (!offer) return null;
                            return (
                              <ManualDeliverForm
                                key={cell.kind}
                                offerId={offer.id}
                                entryId={row.entryId}
                                teamName={`${row.teamName} ${CREDIT_CARD_BY_KIND[cell.kind].code}`}
                              />
                            );
                          })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className={styles.note}>
              팀당 1회. 코드는 발급 완료 시점에 하나 소비되고 되돌리지 않습니다.
              협의 중인 카드는 언락이 일어나도 참가자에게 폴백 가이드만
              보여줍니다. 정보 동의가 없는 팀은 스폰서에게 넘기는 이메일 명단에서
              뺍니다.
            </p>
          </>
        )}
      </section>

      {/* ③ 발송 이력 ─────────────────────────────────────────── */}
      <section className={styles.block}>
        <h2 className={styles.blockTitle}>발송 이력</h2>
        {logs.length === 0 ? (
          <EmptyState
            title="기록이 없습니다"
            detail="혜택을 등록하거나 코드를 보내면 감사 로그에 쌓입니다."
          />
        ) : (
          <ul className={styles.log}>
            {logs.map((row) => (
              <li key={row.id.toString()}>
                <span className={styles.logWhen}>
                  {WHEN.format(row.createdAt)}
                </span>
                <span className={styles.logAction}>{row.action}</span>
                <span className={styles.logActor}>
                  {row.actor?.nickname ?? "시스템"}
                </span>
                <span className={styles.logReason}>{row.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
