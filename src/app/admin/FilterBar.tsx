"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Input, Select } from "@/components/Field";

import c from "./console.module.css";

/*
  필터 줄 — 시안 `.fbar`(참가 관리·감사 로그·스폰서 발급 현황).

  고르면 곧바로 주소의 쿼리가 바뀌고 서버가 다시 거른다. 검색 칸은 Enter나
  칸을 벗어날 때 건다 — 글자마다 요청을 보내면 한글 조합 중에 목록이 흔들린다.
  쿼리에 두는 이유는 새로고침·뒤로가기·주소 공유에 거른 결과가 남아야 해서다.

  첫 선택지(「stage 전체」 같은 것)는 값이 빈 문자열이라 쿼리에서 빠진다.
*/

export type FilterSelect = {
  name: string;
  label: string;
  options: { value: string; label: string }[];
};

export function FilterBar({
  selects,
  search,
  children,
}: {
  selects: FilterSelect[];
  /** 팀명 검색 칸. 쿼리 이름 */
  search?: { name: string; placeholder: string };
  /** 줄 끝에 붙는 것(칩·버튼) */
  children?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(search ? (params.get(search.name) ?? "") : "");

  const push = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className={c.fbar} data-probe="fbar">
      {selects.map((s) => (
        <Select
          key={s.name}
          className={c.fbarSel}
          aria-label={s.label}
          value={params.get(s.name) ?? ""}
          onChange={(e) => push(s.name, e.target.value)}
        >
          {s.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ))}
      {search ? (
        <Input
          className={c.fbarInp}
          placeholder={search.placeholder}
          aria-label={search.placeholder}
          style={{ flex: 1, minWidth: "160px" }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) push(search.name, q.trim());
          }}
          onBlur={() => {
            if (q.trim() !== (params.get(search.name) ?? "")) push(search.name, q.trim());
          }}
        />
      ) : null}
      {children}
    </div>
  );
}
