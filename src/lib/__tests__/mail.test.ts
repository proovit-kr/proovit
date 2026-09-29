/*
  메일의 받는 사람 거르기 — 심사 결과 메일(`sendResultMails`)과 닿을 수 없는 주소.

  돌리는 법:  npm test
  Resend는 부르지 않는다 — 테스트 환경은 mail.ts가 늘 막는다(`live`). 막히기 직전에
  찍는 `[mail]` 줄로 「어디까지 갔나」를 본다.
*/
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendNoticeMail, sendResultMails } from "@/lib/mail";

const NOTICE = {
  title: "1차 심사 결과",
  body: "판정과 사유를 심사 결과에서 확인해요.",
  linkUrl: "/dashboard/judgments",
};

let lines: string[];
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  /* 키가 없으면 거르기 전에 조용히 끝난다 — 거르는 자리까지 가게 키를 둔다 */
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://proovit.kr");
  lines = [];
  vi.spyOn(console, "info").mockImplementation((line: string) => {
    lines.push(line);
  });
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  expect(fetchSpy).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** 발송 직전까지 간 주소 — 테스트라 거기서 막혔다 */
const reached = () =>
  lines.filter((l) => l.includes("발송이 꺼져")).map((l) => l.split("→ ")[1].split(" /")[0]);
/** 닿을 수 없는 주소라 거절한 것 */
const refused = () =>
  lines.filter((l) => l.includes("받을 수 없는 주소")).map((l) => l.split("→ ")[1].split(" /")[0]);

describe("sendResultMails", () => {
  it("계정 설정 「메일」을 켠 팀원에게만 간다", async () => {
    await sendResultMails(
      [
        { email: "leader@gmail.com", notifyEmail: true },
        { email: "mate@gmail.com", notifyEmail: false },
        /* 탈퇴한 계정 — 주소가 비었다 */
        { email: null, notifyEmail: true },
      ],
      NOTICE,
    );
    expect(reached()).toEqual(["leader@gmail.com"]);
  });

  it("제목은 인앱 통지와 같다", async () => {
    await sendResultMails([{ email: "leader@gmail.com", notifyEmail: true }], NOTICE);
    expect(lines[0]).toContain("[PROOVIT] 1차 심사 결과");
  });
});

describe("닿을 수 없는 주소", () => {
  it("예약 도메인에는 보내지 않는다 — 시드·개발 바 계정", async () => {
    for (const email of [
      "minjae@demo.proovit.local",
      "devbar-mate@example.com",
      "a@mail.example.org",
      "b@team.test",
      "c@nowhere.invalid",
    ]) {
      await sendNoticeMail({ email, title: "공지", body: "본문" });
    }
    expect(refused()).toHaveLength(5);
    expect(reached()).toEqual([]);
  });

  it("이름에 example이 든 진짜 도메인은 보낸다", async () => {
    for (const email of ["a@myexample.com", "b@example.co.kr"]) {
      await sendNoticeMail({ email, title: "공지", body: "본문" });
    }
    expect(refused()).toEqual([]);
    expect(reached()).toEqual(["a@myexample.com", "b@example.co.kr"]);
  });
});
