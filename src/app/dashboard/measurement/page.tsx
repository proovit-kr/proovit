import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { guardPage } from "@/lib/access";
import { loadMeasurement } from "@/lib/measurement-store";

import hub from "../hub.module.css";
import { MeasurementPanel } from "./MeasurementPanel";

/*
  측정 연동 — 시안 `#scr-measurement` 세 판(① 검증 대기 · ② 검증됨 · ③ 실패).

  판은 `hostnames` 행이 정한다(measurement.ts `measurementState`) — 검증 시각이
  있으면 ②, 마지막 확인이 실패면 ③, 그 밖은 ①. **행이 없으면 시안에 없는
  「등록 전」 판**이다 — 시안은 팀 주소가 이미 발급된 뒤부터 그리는데, 발급할
  주소(팀명 라벨)와 배포 주소를 받을 자리가 시안 어디에도 없어 이 화면이 받는다
  (허브 온보딩의 「배포하고 주소 연결하기」와 s3 제출 화면이 여기로 보낸다).
  내가 정함(2026-09-22), 수연 확인 대기.

  세 판을 보려면 개발 바의 「측정 연동」 줄(대기·검증됨·실패)을 누른다.

  보기는 팀원도 하고 쓰기는 팀장만 한다 — 정책의 `leaderOnly`가 팀원에게는
  `access.ok=false`와 안내 문구를 주고, 화면은 그 문구를 경고줄로 올린 채
  버튼만 뺀다.
*/

export const metadata: Metadata = {
  title: "측정 연동",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const { viewer, access } = await guardPage(
    "dashboardMeasurement",
    "/dashboard/measurement",
  );
  if (!viewer.entry || !viewer.team) notFound();

  const view = await loadMeasurement(viewer.entry.id);

  return (
    <>
      {/* 시안의 경고줄은 제목보다 위다(허브·팀 관리와 같은 자리) */}
      {!access.ok ? (
        <div className={`${hub.wbar} ${hub.wbarWarn}`} role="status">
          {access.message}
        </div>
      ) : null}

      <h2 className={hub.h1}>측정 연동</h2>
      <p className={hub.sub}>
        배포 주소를 등록하면 팀 주소가 그 앞에 서서 트래픽을 자동으로 집계해요.
      </p>

      <MeasurementPanel
        hostname={view.hostname}
        originUrl={view.originUrl ?? ""}
        state={view.state}
        canWrite={access.ok}
      />
    </>
  );
}
