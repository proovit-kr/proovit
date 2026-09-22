import { StageKey } from "@/generated/prisma/enums";
import { AI_CHECKS, GUIDE_CHECKS, LAUNCH_CHECKS } from "@/content/submission";
import { splitEvidence } from "@/lib/evidence";
import {
  ALTERNATIVE_COUNT,
  NOT_BUILDING_COUNT,
  SURVEY_STRANGER,
} from "@/lib/submission";

/*
  폼 ↔ payload 변환. **순수**다 — page.tsx가 저장된 payload를 폼 기본값으로
  펴고(`toForm`), 서버 액션이 FormData를 스키마 입력으로 접는다(`readForm`).

  폼은 **평평한 이름**을 쓴다(`alt0`·`alt0pain`·`notBuilding1`·`guide2`).
  실패한 제출을 되돌려 채울 때 FormData의 문자열을 그대로 다시 넣을 수 있어야
  해서다 — 중첩 객체를 왕복시키면 그 변환이 두 곳에 생긴다.

  ⚠️ 체크 배열은 항목 수만큼 고정해서 읽는다. 순서가 곧 뜻이다(content/submission.ts).
*/

/** 폼 기본값 — 글자 칸과 켜짐 칸 */
export type FormDefaults = {
  text: Record<string, string>;
  on: Record<string, boolean>;
  /** 태그 입력(홍보한 채널·새로 쓴 유입 채널) */
  channels: string[];
  /** 올린 파일의 키 — 증빙 파일 칸, s1 「문제 정의 상세」의 파일 칸 */
  files: { evidence: string[]; problem: string[] };
};

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const bool = (value: unknown): boolean => value === true;
const strList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
const boolList = (value: unknown, count: number): boolean[] =>
  Array.from({ length: count }, (_, i) =>
    Array.isArray(value) ? value[i] === true : false,
  );

const guideOn = (payload: Record<string, unknown>, stageKey: StageKey) =>
  Object.fromEntries(
    boolList(payload.guideChecks, GUIDE_CHECKS[stageKey].items.length).map(
      (on, i) => [`guide${i}`, on],
    ),
  );

/** 저장된 payload(JSON이라 타입이 없다)와 파일 키를 폼 기본값으로 편다 */
export function toForm(
  stageKey: StageKey,
  payload: unknown,
  evidenceUrls: readonly string[] = [],
): FormDefaults {
  return { ...toFormText(stageKey, payload), files: splitEvidence(evidenceUrls) };
}

function toFormText(stageKey: StageKey, payload: unknown): Omit<FormDefaults, "files"> {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<
    string,
    unknown
  >;
  const on = guideOn(p, stageKey);

  switch (stageKey) {
    case StageKey.s1: {
      const alternatives = Array.isArray(p.alternatives) ? p.alternatives : [];
      const notBuilding = strList(p.notBuilding);
      const text: Record<string, string> = {
        concept: str(p.concept),
        persona: str(p.persona),
        problem: str(p.problem),
        problemDoc: str(p.problemDoc),
        surveyCount: str(p.surveyCount),
        surveyChannel: str(p.surveyChannel),
        surveyStranger: (SURVEY_STRANGER as readonly string[]).includes(
          str(p.surveyStranger),
        )
          ? str(p.surveyStranger)
          : SURVEY_STRANGER[0],
        surveySummary: str(p.surveySummary),
        hypothesisChange: str(p.hypothesisChange),
        differentiation: str(p.differentiation),
        coreFeature: str(p.coreFeature),
        buildPlan: str(p.buildPlan),
        timeline: str(p.timeline),
        pricing: str(p.pricing),
        monetizationPlan: str(p.monetizationPlan),
        riskiest: str(p.riskiest),
        memo: str(p.memo),
      };
      for (let i = 0; i < ALTERNATIVE_COUNT; i += 1) {
        const item = (alternatives[i] ?? {}) as Record<string, unknown>;
        text[`alt${i}`] = str(item.name);
        text[`alt${i}pain`] = str(item.pain);
      }
      for (let i = 0; i < NOT_BUILDING_COUNT; i += 1) {
        text[`notBuilding${i}`] = notBuilding[i] ?? "";
      }
      return { text, on, channels: [] };
    }
    case StageKey.s2:
      return {
        text: { landingUrl: str(p.landingUrl), postUrl: str(p.postUrl), memo: str(p.memo) },
        on,
        channels: strList(p.channels),
      };
    case StageKey.s3:
      return {
        text: {
          serviceUrl: str(p.serviceUrl),
          builder: str(p.builder),
          builderOther: str(p.builderOther),
          memo: str(p.memo),
        },
        on: {
          ...on,
          signupConnected: bool(p.signupConnected),
          paymentReturn: bool(p.paymentReturnRegistered),
          aiFeature: bool(p.aiFeature),
          ...Object.fromEntries(
            boolList(p.launchChecks, LAUNCH_CHECKS.length).map((v, i) => [`launch${i}`, v]),
          ),
          ...Object.fromEntries(
            boolList(p.aiChecks, AI_CHECKS.length).map((v, i) => [`ai${i}`, v]),
          ),
        },
        channels: [],
      };
    case StageKey.s4:
      return {
        text: { activity: str(p.activity), improved: str(p.improved), memo: str(p.memo) },
        on,
        channels: strList(p.channels),
      };
    case StageKey.s5:
      return {
        text: { retro: str(p.retro), memo: str(p.memo) },
        on: {
          ...on,
          monetized: bool(p.monetized),
          paymentConnected: bool(p.paymentConnected),
          archiveConsent: bool(p.archiveConsent),
        },
        channels: [],
      };
  }
}

/** FormData를 스키마가 받는 모양으로 접는다 */
export function readForm(stageKey: StageKey, formData: FormData): Record<string, unknown> {
  const text = (key: string) => String(formData.get(key) ?? "");
  const on = (key: string) => formData.get(key) === "on";
  const checks = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, i) => on(`${prefix}${i}`));
  const guideChecks = checks("guide", GUIDE_CHECKS[stageKey].items.length);
  /* 태그 입력은 같은 이름으로 여러 개 온다. 빈 값은 떨군다 */
  const channels = formData
    .getAll("channels")
    .map((item) => String(item).trim())
    .filter(Boolean);
  /* 파일 키도 칩 하나가 hidden 하나다 */
  const files = (name: string) =>
    formData.getAll(name).map((item) => String(item).trim()).filter(Boolean);

  switch (stageKey) {
    case StageKey.s1:
      return {
        concept: text("concept"),
        persona: text("persona"),
        problem: text("problem"),
        problemDoc: text("problemDoc"),
        surveyCount: text("surveyCount"),
        surveyChannel: text("surveyChannel"),
        surveyStranger: (SURVEY_STRANGER as readonly string[]).includes(text("surveyStranger"))
          ? text("surveyStranger")
          : undefined,
        surveySummary: text("surveySummary"),
        hypothesisChange: text("hypothesisChange"),
        alternatives: Array.from({ length: ALTERNATIVE_COUNT }, (_, i) => ({
          name: text(`alt${i}`),
          pain: text(`alt${i}pain`),
        })),
        differentiation: text("differentiation"),
        coreFeature: text("coreFeature"),
        notBuilding: Array.from({ length: NOT_BUILDING_COUNT }, (_, i) =>
          text(`notBuilding${i}`),
        ),
        buildPlan: text("buildPlan"),
        timeline: text("timeline"),
        pricing: text("pricing"),
        monetizationPlan: text("monetizationPlan"),
        riskiest: text("riskiest"),
        guideChecks,
        evidence: files("evidence"),
        problemDocFiles: files("problemDocFile"),
        memo: text("memo"),
      };
    case StageKey.s2:
      return {
        landingUrl: text("landingUrl"),
        channels,
        postUrl: text("postUrl"),
        guideChecks,
        evidence: files("evidence"),
        memo: text("memo"),
      };
    case StageKey.s3:
      return {
        serviceUrl: text("serviceUrl"),
        builder: text("builder"),
        builderOther: text("builderOther"),
        signupConnected: on("signupConnected"),
        paymentReturnRegistered: on("paymentReturn"),
        launchChecks: checks("launch", LAUNCH_CHECKS.length),
        aiFeature: on("aiFeature"),
        aiChecks: checks("ai", AI_CHECKS.length),
        guideChecks,
        evidence: files("evidence"),
        memo: text("memo"),
      };
    case StageKey.s4:
      return {
        activity: text("activity"),
        channels,
        improved: text("improved"),
        guideChecks,
        evidence: files("evidence"),
        memo: text("memo"),
      };
    case StageKey.s5:
      return {
        monetized: on("monetized"),
        paymentConnected: on("paymentConnected"),
        retro: text("retro"),
        guideChecks,
        evidence: files("evidence"),
        archiveConsent: on("archiveConsent"),
        memo: text("memo"),
      };
  }
}

/**
 * 실패한 제출을 되돌려 채울 값 — FormData의 문자열을 그대로. 체크박스는 켜진
 * 것만 `"on"`으로 온다. 태그는 `channels`가 여러 개라 따로 모은다.
 */
export function echoValues(formData: FormData): {
  values: Record<string, string>;
  channels: string[];
  files: { evidence: string[]; problem: string[] };
} {
  const values: Record<string, string> = {};
  const channels: string[] = [];
  const files = { evidence: [] as string[], problem: [] as string[] };
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (key === "channels") {
      if (value.trim()) channels.push(value.trim());
    } else if (key === "evidence" || key === "problemDocFile") {
      if (value.trim()) files[key === "evidence" ? "evidence" : "problem"].push(value.trim());
    } else if (key !== "intent" && key !== "stageKey") {
      values[key] = value;
    }
  }
  return { values, channels, files };
}
