import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/Badge";
import { Footer } from "@/components/Footer";
import { NavBar } from "@/components/NavBar";
import { guardPage } from "@/lib/access";
import { loadLeaderboard, loadPublicSeason } from "@/lib/public-read";
import type {
  Leaderboard,
  LeaderboardRow,
  PublicSeason,
} from "@/lib/public-read";
import { loadPublicNav } from "@/lib/header-read";
import { fmtYMD } from "@/lib/header-state";

import { FirstRollup, ROLLUP_MINUTES, UpdatedAt } from "./UpdatedAt";
import styles from "./leaderboard.module.css";

/*
  리더보드 — 시안 `#scr-leaderboard`. PLN3 2장 「서비스의 얼굴이자 관전 통로」.

  시안이 그리는 상태는 셋이다.
    ① 집계 전       `.lb-empty`  — 판은 켜졌고 숫자만 아직 없다
    ② 레이스 운영중 `.lb-tbl`    — 순위·유효 이용자·전일 대비·상태
    ③ 시즌 종료     배너 + 표     — 최종 유효 이용자·수상

  ⚠️ **순위를 이 화면에서 계산하지 않는다.** 정본은 `leaderboard_snapshots`이고
  산식이 미확정이다. 임의 정렬로 채우면 그게 곧 "우리가 매긴 순위"가 되고,
  우리가 파는 「조작 불가능한 지표」의 반례가 된다(CLAUDE.md 규칙 1).

  ⚠️ 공개 범위는 팀명·참가작 명칭·URL·지표까지다(동의 문안 A 「공개 범위 안내」).
  참가자 이름은 어디에도 넣지 않는다.
*/

/*
  시즌명이 들어간 제목. 리더보드는 시즌 중 가장 많이 공유되는 주소라
  「리더보드, PROOVIT」 하나로 두면 어느 시즌 것인지 링크만 봐서는 모른다.

  ⚠️ **순위나 팀명을 설명에 넣지 않는다.** 이 화면이 순위를 계산하지 않는 것과
  같은 이유이고(파일 머리 주석), 설명은 검색 결과에 캐시로 오래 남아서 스냅샷이
  갱신돼도 옛 숫자가 그대로 돌아다닌다.
*/
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const season = await loadPublicSeason(slug);
  if (!season) return { title: "리더보드" };

  const title = `${season.title} 리더보드`;
  const description = `${season.title} 참가팀의 유효 이용자 수와 매출 지표로 매긴 순위입니다.`;

  return {
    title,
    description,
    alternates: { canonical: `/seasons/${season.slug}/leaderboard` },
    openGraph: {
      type: "website",
      title,
      description,
      url: `/seasons/${season.slug}/leaderboard`,
    },
  };
}

const NUM = new Intl.NumberFormat("ko-KR");

/*
  게이트 이름. 시즌1은 둘뿐이고 이름이 규칙 문서에 박혀 있다(16 운영규칙 제9조).
  시즌 상세 화면과 같은 표를 쓴다 — 셋 이상인 시즌이 오면 그때 stages에
  이름 칸이 생겨야 한다. 여기서 지어내지 않는다.

  ver3에서 이름이 **「2차 심사(최종)」**으로 통일됐다. ver2는 「최종 심사(실행)」
  8곳과 「2차 심사(실행)」 2곳으로 갈려 있어 §6에서 다수결로 골라 두었던
  자리인데, ver3는 12곳 전부 한 이름이다.

  ⚠️ 다만 **운영규칙서는 아직 「최종 심사」다**(2026-08-29 갱신본 확인).
  참가자에게 공표되는 문서라 대외 명칭이 바뀌려면 그쪽도 고쳐져야 한다 —
  수연이 ver1 피드백에 이미 적어 둔 단서다. 그래서 지금은 **화면 문구만**
  통일하고 `content/rules.ts`(운영규칙서 사본)는 손대지 않는다.
*/
const GATE_LABEL: Record<number, string> = {
  1: "1차 심사(사업성)",
  2: "2차 심사(최종)",
};

type Stage = PublicSeason["stages"][number];

/**
 * 지금이 몇 번째 스테이지인가. `closesAt`이 지난 마지막 단계의 다음이다.
 * 일정이 아직 안 잡혔으면(-1) 아무것도 강조하지 않는다 —
 * 임의로 s1을 켜면 그게 곧 「지금 s1이다」라는 잘못된 정보가 된다.
 */
function currentStageIndex(stages: Stage[], now: Date): number {
  if (!stages.some((s) => s.closesAt)) return -1;
  const passed = stages.filter((s) => s.closesAt && s.closesAt < now).length;
  return Math.min(passed, stages.length - 1);
}

/* 시안 `.stg-track` — 스테이지 알약과 그 뒤에 붙는 게이트 */
function StageTrack({
  stages,
  currentIndex,
}: {
  stages: Stage[];
  currentIndex: number;
}) {
  let gateNo = 0;
  return (
    <ul className={styles.track}>
      {stages.map((stage, i) => {
        /* 지난 단계는 done, 지금이 now, 나머지는 기본 */
        const state =
          currentIndex < 0 || i > currentIndex
            ? ""
            : i < currentIndex
              ? styles.done
              : styles.now;
        const gateLabel = stage.isGate
          ? (GATE_LABEL[++gateNo] ?? "심사")
          : null;
        /*
          ⚠️ **게이트는 자기 `<li>`를 갖는다.** 스테이지와 한 `<li>`에 담으면
          플렉스 아이템이 그 `<li>` 하나라서, 안의 알약 둘이 세로로 쌓여
          게이트가 아랫줄로 떨어진다(2026-09-06 수연 지적).

          시안은 둘을 같은 줄의 형제로 넣는다 — 3356행이 s2 알약 **뒤에**
          게이트를 `insertAdjacentHTML`로 붙인다.
        */
        return (
          <Fragment key={stage.stageKey}>
            <li className={`${styles.stg} ${state}`}>
              <span className={styles.stgKey}>{stage.stageKey}</span>
              {stage.name}
            </li>
            {gateLabel ? (
              <li className={`${styles.stg} ${styles.gate}`}>
                {/*
                  지난 게이트는 통과 표시가 붙는다.

                  ⚠️ **한 문자열로 만든다.** `{gateLabel}{" ✓"}`처럼 나누면
                  텍스트 노드가 둘이 되고 브라우저가 각 조각의 폭을 따로
                  반올림해 0.016px이 어긋난다.
                */}
                {`${gateLabel}${currentIndex > i ? " ✓" : ""}`}
              </li>
            ) : null}
          </Fragment>
        );
      })}
    </ul>
  );
}

/* 시안은 순위를 두 자리로 채운다 — 01, 02 … */
const rankLabel = (rank: number | null) =>
  rank === null ? "—" : String(rank).padStart(2, "0");

function Row({
  row,
  index,
  isFinal,
}: {
  row: LeaderboardRow;
  index: number;
  isFinal: boolean;
}) {
  return (
    <tr className={index < 3 ? styles.top : undefined}>
      <td className={styles.rank}>{rankLabel(row.rank)}</td>
      <td className={styles.team}>
        {row.teamName}
        <small>{row.ideaTitle}</small>
      </td>
      <td className={styles.service}>
        {row.serviceUrl && !row.notDeployed ? (
          /*
            남의 서비스로 나가는 링크다. noopener 없이 열면 그 창이 이 페이지를
            조작할 수 있다.
          */
          <a
            href={row.serviceUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            {new URL(row.serviceUrl).host} ↗
          </a>
        ) : (
          <span className={styles.zr}>—</span>
        )}
      </td>
      <td className={styles.usr}>
        <span className="score">{NUM.format(row.validVisitors)}</span>
        <small>{isFinal ? "FINAL" : "VALID USERS"}</small>
      </td>
      {isFinal ? null : (
        <td className={styles.dt}>
          {row.deltaVisitors === null || row.notDeployed ? (
            /* 앞 집계가 없으면 증감이 성립하지 않는다 */
            <span className={styles.zr}>-</span>
          ) : row.deltaVisitors === 0 ? (
            <span className={styles.zr}>0</span>
          ) : (
            <span className={row.deltaVisitors > 0 ? styles.up : styles.zr}>
              {row.deltaVisitors > 0 ? "+" : "−"}
              {NUM.format(Math.abs(row.deltaVisitors))}
            </span>
          )}
        </td>
      )}
      <td className={styles.bd}>
        {isFinal ? (
          /* 시안의 「수상」 칸. 확정된 상이 있는 팀에만 붙는다 */
          row.award ? (
            <Badge tone="lime">{row.award.label}</Badge>
          ) : null
        ) : /*
          미배포는 숨기지 않는다 — 지표가 0인 이유를 밝히는 것이 0을 그냥
          보여주는 것보다 정확하다(PLN3 2장). 시안의 「상태」 칸도 이 배지
          하나만 그린다(3554행).
        */
        row.notDeployed ? (
          <Badge tone="gray">미배포</Badge>
        ) : null}
      </td>
    </tr>
  );
}

/*
  ⚠️ 시즌 종료에서는 미배포 팀을 뺀다(시안 3561행 `TEAMS.filter(t=>!t[5])`).
  2026-09-20 수연 결정 — 최종 표는 수상 명단에 가까우니 배포도 안 된 팀은
  내린다. 레이스 중에는 그대로 두고 「미배포」 배지로 이유를 밝힌다.

  ⚠️ **빼는 것은 화면에 그리는 행뿐이고 등수는 손대지 않는다.** 순위는
  스냅샷이 정본이고 화면이 계산하지 않는다 — 그래서 뺀 자리의 번호는 비어
  보인다(02가 빠지면 01·03·04). 번호를 다시 매기면 그게 곧 「우리가 매긴
  순위」가 된다.
*/
function Table({ board }: { board: Leaderboard }) {
  const isFinal = board.isFinal;
  const rows = isFinal
    ? board.rows.filter((row) => !row.notDeployed)
    : board.rows;
  return (
    /*
      ⚠️ 가로 스크롤 상자를 두지 않는다. 시안은 좁아져도 표를 그대로 두고
      열 폭을 눌러 담는다(넘치지 않는다). 스크롤 상자를 씌우면 ≤1024에서
      열 폭이 시안과 달라진다.
    */
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">RANK</th>
          <th scope="col">TEAM</th>
          <th scope="col">SERVICE</th>
          <th scope="col" style={{ textAlign: "right" }}>
            {isFinal ? "최종 유효 이용자" : "유효 이용자"}
          </th>
          {isFinal ? null : (
            <th scope="col" style={{ textAlign: "right" }}>
              전일 대비
            </th>
          )}
          <th scope="col" style={{ textAlign: "right" }}>
            {isFinal ? "수상" : "상태"}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <Row key={row.entryId} row={row} index={i} isFinal={isFinal} />
        ))}
      </tbody>
    </table>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { access } = await guardPage(
    "leaderboard",
    `/seasons/${slug}/leaderboard`,
  );

  const season = await loadPublicSeason(slug);
  if (!season) notFound();

  /*
    레이스 전에는 `canAccess`가 409(STAGE_LOCKED)를 준다. 시안에 잠김 화면이
    없으므로 그 자리를 404로 보낸다 — 플래그가 꺼졌을 때와 같은 결과다.
    2026-09-20 수연 결정(시안에 없는 상태를 지운다).
  */
  if (!access.ok) notFound();

  const board = await loadLeaderboard(season.id);
  const ranked = board.rows.some((row) => row.rank !== null);

  /*
    배너의 확정일은 **집계가 닫힌 시각 = s5 마감**이다. 랜딩 ④의 「집계 확정
    기준」과 같은 값이라야 두 화면이 다른 날을 말하지 않는다. 마지막 스냅샷
    날짜(`board.snapshotDate`)를 쓰면 롤업이 늦게 돈 날로 밀린다.
    2026-09-20 수연 결정.
  */
  const finalAt =
    season.stages.find((stage) => stage.stageKey === "s5")?.closesAt ?? null;

  return (
    <main className="page">
      <NavBar {...(await loadPublicNav())} />
      <div className={`${styles.wrap} grow`}>
        <div className={styles.eyebrow}>
          <span className={styles.cur}>LIVE LEADERBOARD</span>
        </div>
        <div className={styles.head}>
          <h1 className={styles.title}>{season.title} 리더보드</h1>
          <span className={styles.upd}>
            <i />
            {/*
              ⚠️ 「집계 대기」는 **시안에 없는 문구다.** 시안은 갱신 시각이 늘
              있는 상태 하나만 그린다(1617행). 스냅샷이 아직 없을 때 이 줄을
              통째로 비울 수는 없어서 채웠다 — 2026-09-06 수연 확인.
            */}
            {board.rolledUpAt ? (
              <UpdatedAt
                iso={board.rolledUpAt.toISOString()}
                renderedAt={board.loadedAt}
              />
            ) : (
              "집계 대기"
            )}
            , 롤업 주기 {ROLLUP_MINUTES}분
          </span>
        </div>

        <StageTrack
          stages={season.stages}
          currentIndex={currentStageIndex(season.stages, new Date())}
        />

        {!ranked ? (
          /* ① 집계 전 */
          <div className={styles.empty}>
            <div className={`${styles.emptyBig} ${styles.cur}`}>
              {/*
                기준 시각은 표를 읽은 때다(`loadedAt`). 화면에서 `Date.now()`를
                부를 수 없어서다 — 위 `UpdatedAt`과 같은 이유다.
              */}
              <FirstRollup
                iso={
                  season.stages
                    .find((stage) => stage.stageKey === "s4")
                    ?.opensAt?.toISOString() ?? null
                }
                renderedAt={board.loadedAt}
              />
            </div>
            {/*
              좁은 폭에서 「표시돼요.」만 떨어지던 줄을 주어 뒤에서 끊는다 —
              서술부를 줄바꿈 없는 공백으로 묶었다. 시안은 폭대로 흐른다(390px에서
              「실시간으로 / 표시돼요.」). 서술부는 약 190px라 360px 칸(294px)에도
              들어간다. 2026-09-20 수연 지침(의미 단위 줄바꿈).
            */}
            <p>참가팀의 유효 이용자 수가 여기에{" "}실시간으로{" "}표시돼요.</p>
          </div>
        ) : (
          <>
            {/* ③ 시즌 종료 */}
            {board.isFinal ? (
              <p className={styles.finalBanner}>
                <Badge tone="lime" className={styles.bannerBadge}>
                  FINAL
                </Badge>
                최종 순위 확정
                {finalAt ? `, ${fmtYMD(finalAt)}` : ""}, 2차 심사(최종) 검증
                반영 완료
              </p>
            ) : null}
            {/* ② 레이스 운영중 */}
            <Table board={board} />
            {board.isFinal ? null : (
              <p className={styles.note}>
                실격 처리된 팀은 목록에서 제외됨,{" "}
                {/*
                  390에서 「참조」만 떨어지던 줄을 쉼표 뒤에서 끊는다 — 서술부를
                  줄바꿈 없는 공백으로 묶었다(위 ① 빈 상자와 같은 처리). 서술부는
                  190px이라 360px 칸(294px)에도 들어간다.

                  시안은 링크에 `href="#rules" data-rule="4"`로 규칙 제4조를
                  가리킨다. 우리 규칙 화면에는 아직 조문 앵커가 없어 문서까지만
                  보낸다.
                */}
                {"유효 이용자 기준은 "}
                <Link className="mono" href="/rules">
                  /rules
                </Link>
                {" 제4조 참조"}
              </p>
            )}
          </>
        )}
      </div>
      <Footer />
    </main>
  );
}
