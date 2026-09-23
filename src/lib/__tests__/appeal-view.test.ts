import { describe, expect, it } from "vitest";

import {
  appealDeadline,
  buildAppealView,
  emphasisParts,
  parseTargetValue,
  plainText,
  responseDeadline,
  targetValue,
} from "@/lib/appeal-view";

const at = (iso: string) => new Date(iso);

describe("parseTargetValue", () => {
  it("「종류:id」를 되돌리고, 모양이 아니면 null", () => {
    expect(parseTargetValue(targetValue("sanction", "abc"))).toEqual({ kind: "sanction", id: "abc" });
    expect(parseTargetValue("judgment:x:y")).toEqual({ kind: "judgment", id: "x:y" });
    expect(parseTargetValue("nope:abc")).toBeNull();
    expect(parseTargetValue("sanction:")).toBeNull();
    expect(parseTargetValue("")).toBeNull();
  });
});

describe("기한", () => {
  it("접수 기한은 통지 후 5영업일의 서울 23:59 — 목 10.22 통지면 10.29", () => {
    /* 2026-10-22(목) 11:00 KST */
    const by = appealDeadline({ noticeAt: at("2026-10-22T02:00:00Z") });
    expect(by.toISOString()).toBe("2026-10-29T14:59:00.000Z");
  });
  it("운영진이 박은 기한이 있으면 그것", () => {
    const fixed = at("2026-10-27T14:59:00Z");
    expect(appealDeadline({ noticeAt: at("2026-10-22T02:00:00Z"), deadlineAt: fixed })).toBe(fixed);
  });
  it("회신 기한은 접수 후 5영업일의 서울 23:59 — 금 10.23 접수면 10.30", () => {
    expect(responseDeadline(at("2026-10-23T00:12:00Z")).toISOString()).toBe(
      "2026-10-30T14:59:00.000Z",
    );
  });
});

describe("buildAppealView", () => {
  const label = (row: { kind: string }) => row.kind;
  it("접수가 없으면 write, 대상은 통지 최신 순", () => {
    const view = buildAppealView({
      targets: [
        { kind: "abuse_flag", id: "f", noticeAt: at("2026-10-18T00:00:00Z"), appealed: false },
        { kind: "sanction", id: "s", noticeAt: at("2026-10-22T02:00:00Z"), appealed: false },
      ],
      appeals: [],
      label,
    });
    expect(view.pane).toBe("write");
    expect(view.targets.map((t) => t.value)).toEqual(["sanction:s", "abuse_flag:f"]);
    expect(view.targets[0].appealBy.toISOString()).toBe("2026-10-29T14:59:00.000Z");
  });
  it("접수가 있으면 sent, 최신 순", () => {
    const older = {
      id: "a",
      submittedAt: at("2026-10-20T00:00:00Z"),
      responseDueAt: null,
      responseText: null,
      respondedAt: null,
      corrected: false,
    };
    const newer = { ...older, id: "b", submittedAt: at("2026-10-23T00:12:00Z") };
    const view = buildAppealView({ targets: [], appeals: [older, newer], label });
    expect(view.pane).toBe("sent");
    expect(view.appeals.map((a) => a.id)).toEqual(["b", "a"]);
  });
});

describe("emphasisParts", () => {
  const em = (text: string, key: number) => ({ text, node: `<${key}:${text}>` });
  it("`**…**`를 강조 조각으로, 나머지는 글자", () => {
    expect(emphasisParts("봇 패턴에 해당하지 않아 **제재를 해제**하고 원복했습니다.", em)).toEqual([
      "봇 패턴에 해당하지 않아 ",
      { text: "제재를 해제", node: "<0:제재를 해제>" },
      "하고 원복했습니다.",
    ]);
  });
  it("짝이 없거나 비어 있으면 글자 그대로", () => {
    expect(emphasisParts("**열린 채", em)).toEqual(["**열린 채"]);
    expect(emphasisParts("", em)).toEqual([]);
    expect(plainText("a **b** c")).toBe("a b c");
  });
});
