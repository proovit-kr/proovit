"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  devSetAuth,
  devSetCurrentStage,
  devSetMetrics,
  devSetPhase,
  devSetHub,
  devSetStatus,
  devSetTeam,
} from "@/app/actions/dev";

import styles from "./DevBar.module.css";

/*
  개발용 토글 바의 화면.

  ⚠️ 판정은 전부 서버에 있다(dev-sandbox.ts). 여기서 하는 일은 폼을 그리고
  서버 액션을 부르는 것뿐이라, 이 파일을 고쳐서 운영을 건드릴 수는 없다.

  버튼을 전부 `<form>`으로 두는 이유는 낙관적 갱신을 안 하기 위해서다 —
  DB가 바뀌고 페이지가 다시 그려진 뒤에 바가 갱신돼야 "바에 찍힌 값 = 화면이
  보고 있는 값"이 유지된다. 이 둘이 어긋나는 순간 도구가 함정이 된다.
*/

/*
  가정한 오늘을 닫힌 줄에 찍는다 — 헤더 배너와 같은 `10.12` 꼴.

  패널에 줄을 두지 않는 이유: 정하는 것은 스테이지 줄이고, 레이스를 벗어나면
  저절로 풀린다(`setSandboxPhase`). 끄는 버튼을 따로 두면 무엇을 끄는 것인지
  설명해야 하는데, 그 설명이 필요한 버튼이면 없는 편이 낫다(09-21 수연 지적).
*/
const DAY = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
});

/** `10. 12.` → `10.12` */
const day = (iso: string) =>
  DAY.formatToParts(new Date(iso))
    .filter((p) => p.type === "month" || p.type === "day")
    .map((p) => p.value)
    .join(".");

type Team = {
  entryId: string;
  userId: string;
  teamName: string;
  ideaTitle: string;
  stage: string;
  status: string;
};

type Option<T extends string> = { value: T; label: string };

type Props = {
  blocked?: string;
  me?: { nickname: string; onboarded: boolean } | null;
  /** 비로그인으로 빼 둔 세션이 있는가. 없으면 「로그인」으로 돌아올 수 없다 */
  parked?: boolean;
  /** 가정한 「오늘」(ISO). null이면 진짜 오늘 */
  today?: string | null;
  current?: Team | null;
  /** 로그인한 계정이 이번 시즌 참가팀에 속했는가. 비로그인이면 null */
  hasTeam?: boolean | null;
  season?: {
    id: string;
    slug: string;
    phase: string;
    metrics: string;
    stage: string | null;
  } | null;
  /* 시안 `#hubSel`의 17종. 그룹은 「정상 흐름」·「예외」 둘이다 */
  hubs?: (Option<string> & { group: string })[];
  /** 지금 눌린 판. 되짚지 못하면 null */
  hubKey?: string | null;
  statuses?: Option<string>[];
  phases?: Option<string>[];
  raceStages?: Option<string>[];
  metrics?: Option<string>[];
};

/*
  값 하나를 실어 보내는 버튼 한 개 = 폼 한 개.

  ⚠️ 액션 타입을 `(formData) => Promise<void>`로 **정확히** 적는다. 캐스팅으로
  얼버무리면 시그니처가 어긋나도 컴파일이 통과한다 — 처음에 (prev, formData)
  두 인자짜리를 그대로 걸었다가 버튼마다 formData가 undefined로 들어와 터졌다.
*/
function PickButton({
  action,
  fields,
  active,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <form action={action}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button
        type="submit"
        className={active ? styles.pickOn : styles.pick}
        aria-pressed={active}
      >
        {children}
      </button>
    </form>
  );
}


/*
  「로그인」 줄만 쓰는 버튼. 누른 뒤 화면을 **다시 불러온다.**

  다른 줄과 달리 이 액션은 쿠키를 바꾸는데, 서버 액션이 같은 요청 안에서 다시
  그리는 렌더는 바꾸기 전의 쿠키를 읽는다 — 그대로 두면 바가 한 단계 옛 상태를
  보여준다(actions/dev.ts의 `devSetAuth` 주석). 새로 부르면 새 쿠키로 읽는다.
*/
function AuthPick({
  on,
  active,
  children,
}: {
  on: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <form
      action={async (formData: FormData) => {
        await devSetAuth(formData);
        /*
          `router.refresh()`로는 바가 안 갱신된다(2026-09-21 확인) — 문서를
          통째로 다시 받아야 새 쿠키로 그린다.
        */
        window.location.reload();
      }}
    >
      <input type="hidden" name="on" value={on ? "1" : "0"} />
      <button
        type="submit"
        className={active ? styles.pickOn : styles.pick}
        aria-pressed={active}
      >
        {children}
      </button>
    </form>
  );
}

/*
  위치 — 닫힌 줄을 끌어서 옮긴다. 이 브라우저에만 기억한다(도구 편의라 서버에
  둘 것이 아니다).

  ⚠️ state가 아니라 DOM 스타일에 직접 쓴다. 이 컴포넌트는 서버에서도 그려지는데,
  저장된 위치를 state로 읽으면 첫 렌더가 서버와 달라 hydration이 어긋난다.
  끄는 동안 매 프레임 다시 그리지 않는 것도 덤이다.

  기준은 CSS와 같은 left·bottom이다 — 바가 위로 열리므로 아래를 붙들어야
  열고 닫을 때 토글이 제자리에 있다.
*/
const POS_KEY = "pv-devbar-pos";
const EDGE = 12;
/* 이만큼 움직여야 끌기로 본다. 그보다 작으면 클릭(열고 닫기)이다 */
const DRAG_SLOP = 4;

type Pos = { left: number; bottom: number };

function placed(el: HTMLElement): Pos | null {
  if (!el.style.left) return null;
  return { left: parseFloat(el.style.left), bottom: parseFloat(el.style.bottom) };
}

/* 화면 밖으로 못 나가게 — 열면 커지므로 열고 닫을 때와 창 크기가 바뀔 때도 다시 맞춘다 */
function place(el: HTMLElement, p: Pos) {
  const maxLeft = Math.max(EDGE, window.innerWidth - el.offsetWidth - EDGE);
  const maxBottom = Math.max(EDGE, window.innerHeight - el.offsetHeight - EDGE);
  el.style.left = `${Math.min(Math.max(p.left, EDGE), maxLeft)}px`;
  el.style.bottom = `${Math.min(Math.max(p.bottom, EDGE), maxBottom)}px`;
}

function loadPos(): Pos | null {
  try {
    const v = JSON.parse(localStorage.getItem(POS_KEY) ?? "null");
    return v && typeof v.left === "number" && typeof v.bottom === "number" ? v : null;
  } catch {
    return null;
  }
}

function savePos(p: Pos) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p));
  } catch {
    /* 사생활 보호 창 등. 기억만 못 할 뿐 끌기는 된다 */
  }
}

export function DevBarClient({
  blocked,
  me,
  parked = false,
  today = null,
  current,
  hasTeam = null,
  season,
  hubs = [],
  hubKey = null,
  statuses = [],
  phases = [],
  raceStages = [],
  metrics = [],
}: Props) {
  const [open, setOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; from: Pos; moved: boolean } | null>(null);
  /* 끌기를 끝낸 pointerup 뒤에 오는 click은 열고 닫기가 아니다 */
  const swallowClick = useRef(false);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const saved = loadPos();
    if (saved) place(el, saved);
    /* 기준은 늘 저장한 자리다 — 안쪽으로 밀린 자리를 기준으로 삼으면 되돌아오지 않는다 */
    const onResize = () => {
      const p = loadPos();
      if (p) place(el, p);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /*
    열면 위로·오른쪽으로 커진다. 옮겨 둔 자리에서 화면 밖으로 넘치면 안쪽으로
    민다. 닫으면 저장한 자리로 돌아간다.
  */
  useLayoutEffect(() => {
    const el = barRef.current;
    const p = loadPos();
    if (el && p) place(el, p);
  }, [open]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = barRef.current;
    if (!el || e.button !== 0) return;
    const r = el.getBoundingClientRect();
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      from: { left: r.left, bottom: window.innerHeight - r.bottom },
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    const el = barRef.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    d.moved = true;
    place(el, { left: d.from.left + dx, bottom: d.from.bottom - dy });
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    const p = barRef.current && placed(barRef.current);
    if (d?.moved && p) {
      swallowClick.current = true;
      savePos(p);
    }
  };

  if (blocked) {
    return (
      <div className={`${styles.bar} ${styles.blocked}`}>
        <span className={styles.tag}>DEV</span>
        <span className={styles.blockedText}>{blocked}</span>
      </div>
    );
  }

  return (
    <div ref={barRef} className={open ? `${styles.bar} ${styles.barOpen}` : styles.bar}>
      {/*
        패널을 토글 위에 그린다. 바가 아래에 붙어 위로 자라므로, 아래에 두면
        여는 순간 토글이 패널 높이만큼 밀려 올라가 닫으러 커서를 옮겨야 한다.
      */}
      {open ? (
        <div className={styles.panel}>
          {/* ── 시즌 페이즈 ─────────────────────────────────── */}
          <div className={styles.row}>
            <span className={styles.label}>페이즈</span>
            <div className={styles.picks}>
              {season ? (
                phases.map((phase) => (
                  <PickButton
                    key={phase.value}
                    action={devSetPhase}
                    fields={{ seasonId: season.id, phase: phase.value }}
                    active={season.phase === phase.value}
                  >
                    {phase.label}
                  </PickButton>
                ))
              ) : (
                <span className={styles.empty}>시즌이 없습니다</span>
              )}
            </div>
          </div>

          {/* ── 레이스 중 지금 스테이지 ──────────────────────── */}
          {season?.phase === "racing" ? (
            <div className={styles.row}>
              <span className={styles.label}>
                스테이지
                <em className={styles.hint}>일정을 옮겨요</em>
              </span>
              <div className={styles.picks}>
                {raceStages.map((stage) => (
                  <PickButton
                    key={stage.value}
                    action={devSetCurrentStage}
                    fields={{ seasonId: season.id, stage: stage.value }}
                    active={season.stage === stage.value}
                  >
                    {stage.label}
                  </PickButton>
                ))}
              </div>
            </div>
          ) : null}

          {/*
            ── 로그인 ───────────────────────────────────────────
            공개 화면이 관전자에게 어떻게 보이는지 보는 줄이다. 아래 세 줄이
            전부 「로그인한 계정」 기준이라 그 위에 둔다.

            세션을 **지어내지 않는다** — 쿠키를 빼 뒀다 돌려놓을 뿐이라
            처음 한 번은 평소대로 로그인해야 한다(lib/dev-session.ts).
          */}
          <div className={styles.row}>
            <span className={styles.label}>
              로그인
              <em className={styles.hint}>세션을 빼 뒀다 돌려놔요</em>
            </span>
            <div className={styles.picks}>
              {me || parked ? (
                [
                  { on: true, label: "로그인" },
                  { on: false, label: "비로그인" },
                ].map((pick) => (
                  <AuthPick key={pick.label} on={pick.on} active={!!me === pick.on}>
                    {pick.label}
                  </AuthPick>
                ))
              ) : (
                <span className={styles.empty}>
                  한 번 로그인하면 여기서 오갈 수 있어요
                </span>
              )}
            </div>
          </div>

          {/* ── 참가팀 ──────────────────────────────────────── */}
          <div className={styles.row}>
            <span className={styles.label}>
              참가팀
              <em className={styles.hint}>로그인한 계정</em>
            </span>
            <div className={styles.picks}>
              {!season ? (
                <span className={styles.empty}>시즌이 없습니다</span>
              ) : hasTeam === null ? (
                <span className={styles.empty}>로그인하면 바꿀 수 있어요</span>
              ) : (
                [
                  { on: true, label: "있음" },
                  { on: false, label: "없음" },
                ].map((pick) => (
                  <PickButton
                    key={pick.label}
                    action={devSetTeam}
                    fields={{ seasonId: season.id, on: pick.on ? "1" : "0" }}
                    active={hasTeam === pick.on}
                  >
                    {pick.label}
                  </PickButton>
                ))
              )}
            </div>
          </div>

          {/*
            ── 진도 ──────────────────────────────────────────
            시안 `#hubSel`의 17종을 그대로 둔다(2026-09-21 수연 지시).
            한 줄이 페이즈·생존 상태·온보딩·집계·「오늘」까지 같이 옮기므로,
            누르면 아래 줄들의 값도 함께 바뀐다.

            ⚠️ **예외 여덟(10~17)은 화면이 아직 없다.** 눌러도 상태는 제대로
            만들어지지만 허브는 옛 안내를 그린다 — 그 판을 옮길 때 바로 쓴다.
          */}
          {["정상 흐름", "예외"].map((group) => (
            <div key={group} className={styles.row}>
              <span className={styles.label}>
                {group === "정상 흐름" ? "진도" : ""}
                <em className={styles.hint}>
                  {group === "정상 흐름" ? "허브 정상 흐름" : "허브 예외"}
                </em>
              </span>
              <div className={styles.picks}>
                {current && season ? (
                  hubs
                    .filter((hub) => hub.group === group)
                    .map((hub) => (
                      <PickButton
                        key={hub.value}
                        action={devSetHub}
                        fields={{
                          entryId: current.entryId,
                          seasonId: season.id,
                          key: hub.value,
                        }}
                        active={hubKey === hub.value}
                      >
                        {hub.label}
                      </PickButton>
                    ))
                ) : (
                  <span className={styles.empty}>
                    로그인한 계정에 참가 기록이 없어요
                  </span>
                )}
              </div>
            </div>
          ))}

          {/* ── 생존 상태 ───────────────────────────────────── */}
          <div className={styles.row}>
            <span className={styles.label}>상태</span>
            <div className={styles.picks}>
              {current ? (
                statuses.map((status) => (
                  <PickButton
                    key={status.value}
                    action={devSetStatus}
                    fields={{ entryId: current.entryId, status: status.value }}
                    active={current.status === status.value}
                  >
                    {status.label}
                  </PickButton>
                ))
              ) : (
                <span className={styles.empty}>로그인한 계정에 참가 기록이 없어요</span>
              )}
            </div>
          </div>

          {/*
            ── 집계 데이터 ─────────────────────────────────────
            **s4에서만 고를 수 있다**(2026-09-20 수연 지시). 나머지 스테이지는
            상태가 하나로 정해져 있어서 고를 것이 없다 — s1~s3은 집계 전,
            s5는 레이스 운영중이고, 스테이지 줄이 그 값을 같이 옮긴다.
            「시즌 종료」는 페이즈 줄의 「종료」가 만든다.
          */}
          {season?.phase === "racing" && season.stage === "s4" ? (
          <div className={styles.row}>
            <span className={styles.label}>
              집계
              <em className={styles.hint}>s4에서만</em>
            </span>
            <div className={styles.picks}>
              {season ? (
                metrics.map((kind) => (
                  <PickButton
                    key={kind.value}
                    action={devSetMetrics}
                    fields={{ seasonId: season.id, kind: kind.value }}
                    active={season.metrics === kind.value}
                  >
                    {kind.label}
                  </PickButton>
                ))
              ) : (
                <span className={styles.empty}>시즌이 없습니다</span>
              )}
            </div>
          </div>
          ) : null}

          <p className={styles.foot}>
            dev DB에만 붙습니다. 여기서 만든 제출물은 「[개발용]」으로, 지표는
            「운영자 보정」으로 표시돼요. 리더보드는 페이즈가 레이스 이상이고
            스테이지가 s4부터일 때 열려요 — 스테이지 줄이 함께 켜요.
          </p>
        </div>
      ) : null}

      <button
        type="button"
        className={styles.toggle}
        onClick={() => {
          if (swallowClick.current) {
            swallowClick.current = false;
            return;
          }
          setOpen((v) => !v);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-expanded={open}
        title="끌어서 옮기기"
      >
        <span className={styles.tag}>DEV</span>
        <span className={styles.who}>
          {me ? me.nickname : "비로그인"}
          {current ? ` · ${current.teamName}` : null}
        </span>
        <span className={styles.summary}>
          {current ? `${current.stage} / ${current.status}` : "참가 기록 없음"}
          {season ? ` · ${season.phase}` : null}
          {today ? ` · 오늘 ${day(today)}` : null}
        </span>
        <span className={styles.caret} aria-hidden>
          {open ? "▾" : "▴"}
        </span>
      </button>
    </div>
  );
}
