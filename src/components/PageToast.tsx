"use client";

import { createContext, type ReactNode, useContext } from "react";

import { Toast, useToast } from "@/components/Toast";

/*
  화면에 토스트 하나 — 시안 `#toast`처럼 판 전체가 하나를 나눠 쓴다.

  버튼마다 토스트를 그리면 그 요소가 버튼 옆에 남아 시안과 자식 수가 어긋나고,
  둘이 겹쳐 뜰 수도 있다. 여기서 한 번 만들고 버튼들은 `usePageToast()`로
  띄우기만 한다(혜택과 크레딧의 `CreditsToast`와 같은 꼴).
*/
const Ctx = createContext<(text: string) => void>(() => {});

export function PageToast({ children }: { children: ReactNode }) {
  const { message, show } = useToast();
  return (
    <Ctx.Provider value={show}>
      {children}
      <Toast message={message} />
    </Ctx.Provider>
  );
}

export function usePageToast() {
  return useContext(Ctx);
}
