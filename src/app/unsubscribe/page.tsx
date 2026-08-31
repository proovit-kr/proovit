import type { Metadata } from "next";

import { cancelLead } from "@/app/actions/lead";
import { Button } from "@/components/Button";
import { Footer } from "@/components/Footer";
import { NavBar } from "@/components/NavBar";
import { getCurrentSeason, resolveNav } from "@/lib/season";

import styles from "./unsubscribe.module.css";

/*
  수신거부·신청취소 결과 — 메일 하단 링크가 도착하는 곳.

  ⚠️ **시안에 없는 화면이다.** 시안 화면 레지스트리는 사전신청 랜딩까지만
  그리고 메일에서 돌아오는 자리를 다루지 않는다. 그래도 지워서는 안 된다 —
  구현 규칙 6·10이 요구하는 철회 수단의 착지점이고, 보유기간을 「동의 철회
  시까지」로 약속한 것의 유일한 실행 경로다.

  값은 지어내지 않고 문서 화면(DocPage)과 같은 리듬을 쓴다.
*/

export const metadata: Metadata = {
  title: "수신거부",
  /* 메일에서 오는 1회성 화면이다. 검색에 남을 이유가 없다 */
  robots: { index: false, follow: false },
};

const MESSAGE: Record<string, { title: string; body: string }> = {
  done: {
    title: "광고성 정보 수신을 해지했어요",
    body: "앞으로 시즌 모집 소식이나 이벤트 안내는 보내지 않아요. 사전 신청 자체는 그대로 남아 있어서, 서비스 오픈과 모집 개시 안내는 계속 받으실 수 있어요.",
  },
  already: {
    title: "이미 해지된 주소예요",
    body: "이 주소는 광고성 정보를 받고 있지 않아요. 서비스 오픈과 모집 개시 안내처럼 신청 처리에 필요한 메일만 보내드려요.",
  },
  cancelled: {
    title: "사전 신청을 취소했어요",
    body: "동의를 철회하셨으므로 저장했던 이메일 주소를 지웠어요. 다시 신청하고 싶으시면 언제든 첫 화면에서 하실 수 있어요.",
  },
  gone: {
    title: "이미 취소된 신청이에요",
    body: "이 링크가 가리키던 사전 신청은 남아 있지 않아요. 저장된 이메일 주소도 없어요.",
  },
  invalid: {
    title: "링크를 확인하지 못했어요",
    body: "주소가 잘린 채 열렸을 수 있어요. 받으신 메일에서 링크를 다시 눌러 주세요. 계속 안 되면 help@proovit.kr로 알려 주세요.",
  },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; t?: string }>;
}) {
  const { s, t } = await searchParams;
  const state = s && s in MESSAGE ? s : "invalid";
  const copy = MESSAGE[state];
  const season = await getCurrentSeason();

  /* 아직 지울 것이 남아 있는 상태에서만 취소 버튼을 낸다 */
  const canCancel = t && (state === "done" || state === "already");

  return (
    <main className="page">
      <NavBar {...resolveNav(season)}
      />
      <div className={`${styles.wrap} grow`}>
        <h1 className={styles.title}>{copy.title}</h1>
        <p className={styles.body}>{copy.body}</p>

        {canCancel ? (
          <form action={cancelLead} className={styles.cancel}>
            <input type="hidden" name="t" value={t} />
            <p className={styles.body}>
              사전 신청도 취소할까요? 저장했던 이메일 주소를 지워요. 되돌릴 수
              없어요.
            </p>
            <Button type="submit" variant="danger">
              사전 신청 취소
            </Button>
          </form>
        ) : null}
      </div>
      <Footer />
    </main>
  );
}
