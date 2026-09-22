"use client";

import { createContext, type ReactNode, useContext } from "react";

import { Toast, useToast } from "@/components/Toast";

/*
  화면에 토스트 하나 — 시안 `#toast`처럼 판 전체가 하나를 나눠 쓴다.

  카드마다 폼이 셋(받기·적용·복사)인데 각자 토스트를 그리면 그 요소가 폼 안에
  남아 시안과 자식 수가 어긋나고, 둘이 겹쳐 뜰 수도 있다. 여기서 한 번 만들고
  폼들은 `useCreditsToast()`로 띄우기만 한다.
*/
const Ctx = createContext<(text: string) => void>(() => {});

export function CreditsToast({ children }: { children: ReactNode }) {
  const { message, show } = useToast();
  return (
    <Ctx.Provider value={show}>
      {children}
      <Toast message={message} />
    </Ctx.Provider>
  );
}

export function useCreditsToast() {
  return useContext(Ctx);
}
