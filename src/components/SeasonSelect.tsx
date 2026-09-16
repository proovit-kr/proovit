"use client";

import { useRouter } from "next/navigation";

/*
  운영자 헤더의 시즌 셀렉트(시안 `.ssel`).

  ⚠️ 시즌별 운영 화면은 아직 없다 — 콘솔은 늘 「지금 시즌」을 본다. 그래서
  고르면 시즌 관리(`/admin/seasons`)로 보낸다. 아카이브 시즌을 고르면 배지가
  「아카이브」로 바뀌고 쓰기가 잠기는 것(시안 A7 노트)은 시즌별 조회가 생길 때
  붙인다. 그때까지 죽은 셀렉트를 두지 않으려는 최소한의 행선지다.
*/
export function SeasonSelect({
  seasons,
  className,
}: {
  seasons: { id: string; label: string; selected: boolean }[];
  className?: string;
}) {
  const router = useRouter();
  const selected = seasons.find((s) => s.selected)?.id ?? seasons[0]?.id ?? "";
  return (
    <select
      className={className}
      aria-label="시즌 선택"
      value={selected}
      onChange={() => router.push("/admin/seasons")}
    >
      {seasons.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
