import type { ReactNode } from "react";

import { AdminTop } from "@/components/AdminTop";
import { AdminTag } from "@/components/HeaderBits";
import { Logo } from "@/components/NavBar";
import { SideNav } from "@/components/SideNav";
import { loadViewerState } from "@/lib/access";
import { loadAdminHeader } from "@/lib/header-read";

import styles from "./admin.module.css";

/*
  운영자 콘솔 껍데기.

  상단 바는 「헤더 상태별 시안 v1.0」의 어드민 크롬(A1~A7)이다 — 워드마크,
  ADMIN 태그, 시즌 셀렉트, 상태 배지, 지금 처리할 대기열, 이메일 칩, 아바타.
  판정은 header-state.ts, 재료는 header-read.ts, 그리기는 AdminTop이 한다.
  콘솔 네비게이션은 시안대로 좌측 사이드바(`.db-side`)다 — 참가자 화면과 같은
  `SideNav` 상자를 쓰고 `tone="ops"`로 활성 색만 바이올렛으로 바꾼다(시안 `.adm`).

  ⚠️ 한때 「참가자 화면과 배경·글자색을 다르게 쓴다」고 적혀 있었는데 **사실이
  아니다.** `--c-bg-ops`·`--c-surface-ops`·`--c-text-ops`는 전부 일반 토큰의
  별칭이라 구분하는 색이 없다(globals.css: 「시안은 운영자 화면에 별도 배경을
  두지 않는다. `.adm`은 활성 항목만 바이올렛으로 바꾼다」).

  지금 운영자 세션임을 알리는 것은 색이 아니라 **ADMIN 태그와 바이올렛
  아바타**다(헤더 상태별 시안 P11·A 계열). 운영자 화면의 쓰기는 전부 감사
  로그에 남고 되돌리기 어려우므로 그 표시가 어느 화면에서든 보여야 한다.

  ⚠️ 여기서 접근을 막지 않는다. 레이아웃은 판정 자리가 아니다 —
  각 page.tsx가 `guardPage("admin…")`으로 막는다. 레이아웃에서만 막으면
  나중에 추가되는 라우트가 조용히 열린다. 다만 대기열 숫자는 운영자에게만
  읽는다(`loadAdminHeader`가 역할을 본다) — 비운영자에게는 워드마크와 태그만
  그리고 곧 page가 404를 낸다.
*/

/*
  ⚠️ 플래그로 가리는 항목이 하나 있다. 참가자 레이아웃과 같은 규칙이다 —
  꺼진 기능은 링크를 아예 만들지 않는다(06 §4.4). 직접 주소를 치면
  `canAccess("adminSponsors")`가 404를 낸다.
*/
/*
  이름과 순서는 시안 `AMENU`(3644행) 그대로다. 스폰서 크레딧은 맨 끝이라
  플래그로 뺄 때 순서가 안 흐트러진다.
*/
const ITEMS = [
  { href: "/admin", label: "대시보드" },
  { href: "/admin/seasons", label: "시즌 관리" },
  { href: "/admin/entries", label: "참가 관리" },
  { href: "/admin/judging", label: "심사" },
  { href: "/admin/metrics", label: "지표 검토" },
  { href: "/admin/leads", label: "사전신청 리드" },
  { href: "/admin/abuse", label: "어뷰징" },
  { href: "/admin/notifications", label: "공지 발송" },
  { href: "/admin/audit-logs", label: "감사 로그" },
  { href: "/admin/awards", label: "시상" },
];

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const viewer = await loadViewerState();
  const header = await loadAdminHeader(viewer);

  const items = viewer.season?.flags.sponsors
    ? [...ITEMS, { href: "/admin/sponsors", label: "스폰서 크레딧" }]
    : ITEMS;

  return (
    <div className={`page page--ops ${styles.page}`}>
      <header className={styles.head}>
        {header ? (
          <AdminTop model={header} />
        ) : (
          <div className={styles.bare}>
            <Logo />
            <AdminTag />
          </div>
        )}
      </header>

      <div className={styles.db}>
        <SideNav
          groups={[{ items }]}
          tone="ops"
          label="운영자 콘솔"
          roots={["/admin"]}
        />
        <main className={`${styles.body} grow`} data-probe="ad-body">
          {children}
        </main>
      </div>
    </div>
  );
}
