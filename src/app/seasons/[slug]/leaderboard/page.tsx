import type { Metadata } from "next";
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
import { getCurrentSeason, resolveNav } from "@/lib/season";

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

export const metadata: Metadata = {
  title: "리더보드",
};

const DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
});
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
        return (
          <li key={stage.stageKey}>
            <span className={`${styles.stg} ${state}`}>
              <span className={styles.stgKey}>{stage.stageKey}</span>
              {stage.name}
            </span>
            {gateLabel ? (
              <span className={`${styles.stg} ${styles.gate}`}>
                {/* 지난 게이트는 통과 표시가 붙는다 */}
                {gateLabel}
                {currentIndex > i ? " ✓" : ""}
              </span>
            ) : null}
          </li>
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
        ) : (
          <>
            {/*
              미배포는 숨기지 않는다 — 지표가 0인 이유를 밝히는 것이 0을 그냥
              보여주는 것보다 정확하다(PLN3 2장).
            */}
            {row.notDeployed ? <Badge tone="gray">미배포</Badge> : null}
            {row.awardIneligible ? <Badge tone="warn">시상 제외</Badge> : null}
          </>
        )}
      </td>
    </tr>
  );
}

/*
  ⚠️ 시즌 종료에서 미배포 팀을 빼지 않는다.

  시안의 최종 표는 미배포 팀을 걸러내지만(`TEAMS.filter(t=>!t[5])`), 그건 손으로
  적은 목업 배열의 사정이지 규칙으로 적힌 것이 아니다. 순위는 스냅샷이 정본이고
  화면이 계산하지 않는다는 이 파일의 원칙상, 등수가 매겨진 팀을 화면에서 빼면
  그게 곧 「우리가 뺀 순위」가 된다. 윤서에게 확인받을 것.
*/
function Table({ board }: { board: Leaderboard }) {
  const isFinal = board.isFinal;
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
        {board.rows.map((row, i) => (
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

  /* 잠김(레이스 전)은 404가 아니다 — 언제 열리는지 말해야 관전자가 다시 온다 */
  const board = access.ok ? await loadLeaderboard(season.id) : null;
  const current = await getCurrentSeason();
  const ranked = board?.rows.some((row) => row.rank !== null) ?? false;

  return (
    <main className="page">
      <NavBar {...resolveNav(current)}
      />
      <div className={`${styles.wrap} grow`}>
        <div className={styles.eyebrow}>
          <span className={styles.cur}>LIVE LEADERBOARD</span>
        </div>
        <div className={styles.head}>
          <h1 className={styles.title}>{season.title} 리더보드</h1>
          <span className={styles.upd}>
            <i />
            {board?.snapshotDate
              ? `${DATE.format(board.snapshotDate)} 갱신, 롤업 주기 15분`
              : "집계 대기, 롤업 주기 15분"}
          </span>
        </div>

        <StageTrack
          stages={season.stages}
          currentIndex={currentStageIndex(season.stages, new Date())}
        />

        {!access.ok ? (
          /* ⚠️ 시안에 없는 상태. 레이스 전에는 canAccess가 409를 준다 */
          <div className={styles.locked}>
            리더보드는 레이스가 시작되면 열려요.
            <br />
            그때부터 참가팀의 유효 이용자 수가 여기에 실시간으로 표시돼요.
          </div>
        ) : !board || !ranked ? (
          /* ① 집계 전 */
          <div className={styles.empty}>
            <div className={`${styles.emptyBig} ${styles.cur}`}>
              집계 시작됨, 첫 갱신을 기다려요
            </div>
            <p>참가팀의 유효 이용자 수가 여기에 실시간으로 표시돼요.</p>
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
                {board.snapshotDate
                  ? `, ${DATE.format(board.snapshotDate)}`
                  : ""}
                , 2차 심사(최종) 검증 반영 완료
              </p>
            ) : null}
            {/* ② 레이스 운영중 */}
            <Table board={board} />
            {board.isFinal ? null : (
              <p className={styles.note}>
                실격 처리된 팀은 목록에서 제외됨, 유효 이용자 기준은{" "}
                <Link href="/rules">/rules</Link> 참조
              </p>
            )}
          </>
        )}
      </div>
      <Footer />
    </main>
  );
}
