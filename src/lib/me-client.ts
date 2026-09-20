"use client";

import type { EntryStatus } from "@/generated/prisma/enums";

/*
  `/api/v1/me`를 **문서당 한 번만** 부른다.

  부르는 쪽이 둘이다 — 헤더(NavBar, 정적 화면에서 유저 축을 채운다)와 계정 동의
  게이트(ConsentGate). 각자 fetch하면 랜딩에서 같은 응답을 두 번 받는다.
  `Cache-Control: no-store`라 브라우저가 합쳐 주지도 않는다.

  ⚠️ 문서가 살아 있는 동안만 기억한다. 클라이언트 이동(router push)에서는
  다시 부르지 않고, 새로고침하면 새로 받는다. 응답이 바뀌는 계기는 로그인·
  동의 저장인데 둘 다 부르는 쪽이 자기 상태로 반영한다.
*/

export type MeBody = {
  user: { nickname: string; roles: string[] } | null;
  entry: { status: EntryStatus } | null;
  unread?: number;
  consent: {
    provider: "kakao" | "google" | null;
    maskedEmail: string;
    reconsent: boolean;
  } | null;
};

let inflight: Promise<MeBody | null> | null = null;

/** 실패하면 null. 화면은 비로그인 모양으로 남는다 — 판정은 어차피 서버가 한다 */
export function fetchMe(): Promise<MeBody | null> {
  inflight ??= fetch("/api/v1/me")
    .then((r) => (r.ok ? r.json() : null))
    .then((body) => (body?.ok ? (body.data as MeBody) : null))
    .catch(() => null);
  return inflight;
}
