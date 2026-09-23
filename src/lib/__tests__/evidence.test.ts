import { describe, expect, it } from "vitest";

import {
  buildEvidenceKey,
  evidenceHref,
  evidenceName,
  foreignEvidence,
  parseEvidenceKey,
  safeFileName,
  sniffKind,
  splitEvidence,
} from "@/lib/evidence";
import { S1DraftSchema, S1Schema } from "@/lib/submission";

const ENTRY = "0f5a2b9c-1d2e-4f3a-8b4c-5d6e7f8a9b0c";
const OTHER = "1f5a2b9c-1d2e-4f3a-8b4c-5d6e7f8a9b0c";
const ID = "0123456789abcdef0123456789abcdef";

const key = (slot: "evidence" | "problem", name = "a.pdf", entryId = ENTRY, stageKey = "s1" as const) =>
  buildEvidenceKey({ entryId, stageKey, slot, id: ID, name });

describe("증빙 파일 키", () => {
  it("만든 키를 도로 읽는다 — 한글 이름도", () => {
    const k = key("evidence", "인터뷰 기록.pdf");
    expect(parseEvidenceKey(k)).toEqual({
      entryId: ENTRY, stageKey: "s1", slot: "evidence", id: ID, name: "인터뷰 기록.pdf",
    });
    expect(evidenceName(k)).toBe("인터뷰 기록.pdf");
    expect(evidenceHref(k)).toBe(`/api/evidence/${ENTRY}/s1/evidence/${ID}-${encodeURIComponent("인터뷰 기록.pdf")}`);
  });

  it("모양이 다른 키는 null", () => {
    expect(parseEvidenceKey("../etc/passwd")).toBeNull();
    expect(parseEvidenceKey(`${ENTRY}/s9/evidence/${ID}-a.pdf`)).toBeNull();
    /* 소명 증빙 — 스테이지 자리에 `appeal` */
    expect(parseEvidenceKey(`${ENTRY}/appeal/evidence/${ID}-a.pdf`)?.stageKey).toBe("appeal");
    expect(parseEvidenceKey(`${ENTRY}/s1/other/${ID}-a.pdf`)).toBeNull();
    expect(parseEvidenceKey(`${ENTRY}/s1/evidence/short-a.pdf`)).toBeNull();
    expect(parseEvidenceKey(`${ENTRY}/s1/evidence/${ID}-a/b.pdf`)).toBeNull();
  });

  it("남의 팀·다른 판·엉뚱한 키를 골라낸다", () => {
    const mine = key("evidence");
    const problem = key("problem");
    const theirs = key("evidence", "a.pdf", OTHER);
    const s2 = key("evidence", "a.pdf", ENTRY, "s2" as never);
    expect(foreignEvidence([mine, problem], ENTRY, "s1")).toEqual([]);
    expect(foreignEvidence([mine, theirs, s2, "junk"], ENTRY, "s1")).toEqual([theirs, s2, "junk"]);
  });

  it("칸별로 가른다 — 모양이 틀린 키는 버린다", () => {
    expect(splitEvidence([key("evidence"), key("problem"), "junk"])).toEqual({
      evidence: [key("evidence")],
      problem: [key("problem")],
    });
  });
});

describe("파일 종류·이름", () => {
  const bytes = (...b: number[]) => new Uint8Array(b);
  it("첫 바이트로 종류를 본다", () => {
    expect(sniffKind(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe("pdf");
    expect(sniffKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(sniffKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpg");
    expect(sniffKind(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe("webp");
    expect(sniffKind(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe("gif");
    expect(sniffKind(bytes(0x4d, 0x5a))).toBeNull();
    expect(sniffKind(bytes())).toBeNull();
  });

  it("이름을 다듬고 확장자는 실제 종류로", () => {
    expect(safeFileName("../evil/../x.png", "pdf")).toBe("..evil..x.pdf");
    expect(safeFileName("포스팅 캡처.PNG", "png")).toBe("포스팅 캡처.png");
    expect(safeFileName("a#b?c%d.jpg", "jpg")).toBe("abcd.jpg");
    expect(safeFileName(".pdf", "pdf")).toBe("file.pdf");
    expect(safeFileName("x".repeat(200) + ".pdf", "pdf")).toBe("x".repeat(80) + ".pdf");
  });
});

describe("s1 「문제 정의 상세」 — 본문과 파일 둘 중 하나", () => {
  const base = {
    concept: "c", coreFeature: "f", notBuilding: ["a", "b"], riskiest: "r",
    persona: "", problem: "", surveyCount: "", surveyChannel: "", surveySummary: "",
    hypothesisChange: "", alternatives: [{ name: "", pain: "" }, { name: "", pain: "" }],
    differentiation: "", buildPlan: "", timeline: "", pricing: "", monetizationPlan: "",
    guideChecks: [true, true, true], evidence: [],
  };
  it("둘 다 비면 제출을 막고 problemDoc 칸에 붙는다", () => {
    const r = S1Schema.safeParse({ ...base, problemDoc: "", problemDocFiles: [] });
    expect(r.success).toBe(false);
    expect(r.success ? [] : r.error.issues.map((i) => i.path.join("."))).toContain("problemDoc");
  });
  it("본문만, 파일만 — 둘 다 통과", () => {
    expect(S1Schema.safeParse({ ...base, problemDoc: "글", problemDocFiles: [] }).success).toBe(true);
    expect(S1Schema.safeParse({ ...base, problemDoc: "", problemDocFiles: [key("problem")] }).success).toBe(true);
  });
  it("임시 저장은 둘 다 비어도 된다, 파일은 다섯까지", () => {
    expect(S1DraftSchema.safeParse({ ...base, problemDoc: "", problemDocFiles: [] }).success).toBe(true);
    const six = Array.from({ length: 6 }, (_, i) => key("evidence", `${i}.pdf`));
    expect(S1DraftSchema.safeParse({ ...base, problemDoc: "", problemDocFiles: [], evidence: six }).success).toBe(false);
  });
});
