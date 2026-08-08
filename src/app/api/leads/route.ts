import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  MARKETING_CONSENT_VERSION,
  PRIVACY_CONSENT_VERSION,
} from "@/content/consent";
import { prisma } from "@/lib/prisma";
import { getClientIp, limitByIp } from "@/lib/ratelimit";
import { getCurrentSeason } from "@/lib/season";

/*
  POST /api/leads — 04 API 명세 §1

  사전신청 이메일 수집. 시즌1 KPI#1(실측 신청자 수·전환율)의 유일한 원천이고,
  '모두의 창업 2기' 지원서에 들어갈 수요 검증 근거다.

  IP 레이트리밋은 구현됐다(06 §12). 같은 조항이 요구하는 **Turnstile은 아직 없다** —
  레이트리밋만으로는 분산 IP 봇을 막지 못하므로, 랜딩을 널리 홍보하기 전에 붙여야 한다.
*/

/*
  필수 동의를 서버에서 다시 막는 이유: 화면의 disabled는 사용자 편의일 뿐
  접수를 막는 장치가 아니다. 동의 없이 들어온 리드는 저장하는 것 자체가 위법이라
  프론트 검증만 믿을 수 없다.

  literal(true)이므로 false·누락 모두 400이 된다.
*/
const bodySchema = z.object({
  email: z.email({ message: "이메일 형식이 올바르지 않습니다." }).max(254),
  privacyConsent: z.literal(true, {
    message: "개인정보 수집·이용에 동의해야 신청할 수 있어요.",
  }),
  ageConfirmed: z.literal(true, {
    message: "만 14세 이상만 신청할 수 있어요.",
  }),
  /* 선택 동의. 기본값은 미동의이고, 미동의로도 접수된다(D5). */
  marketingOptIn: z.boolean().default(false),
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(120).optional(),
});

export async function POST(request: NextRequest) {
  // 가장 먼저 본다. 본문 파싱도 DB 조회도 하기 전에 끊는 것이 가장 싸다.
  const { success, retryAfterSeconds } = await limitByIp(getClientIp(request));
  if (!success) {
    return Response.json(
      {
        error: "RATE_LIMITED",
        message: "요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.",
      },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json(
      { error: "INVALID_JSON", message: "요청 본문을 읽을 수 없습니다." },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      {
        error: "VALIDATION_FAILED",
        message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
      },
      { status: 400 },
    );
  }

  const season = await getCurrentSeason();
  if (!season) {
    return Response.json(
      {
        error: "NO_OPEN_SEASON",
        message: "지금은 사전 신청을 받고 있지 않습니다.",
      },
      { status: 409 },
    );
  }

  const { email, marketingOptIn, utmSource, utmMedium, utmCampaign } = parsed.data;

  /*
    이미 신청한 이메일이어도 성공으로 응답한다.
    ① 사용자에게는 "신청됨"이 맞는 결과다 — 에러를 보여줄 이유가 없다.
    ② 409를 주면 "이 이메일이 등록돼 있는지"를 외부에서 확인할 수 있게 된다.
    upsert를 쓰면 재신청 시 utm이 덮여 최초 유입 채널이 사라지므로,
    존재하면 그대로 두는 쪽을 택한다.
  */
  const existing = await prisma.lead.findUnique({
    where: { seasonId_email: { seasonId: season.id, email } },
    select: { id: true, marketingOptIn: true },
  });

  if (!existing) {
    try {
      await prisma.lead.create({
        data: {
          email,
          seasonId: season.id,
          utmSource,
          utmMedium,
          utmCampaign,
          // 유입 경로 추적. 개인정보가 아니라 출처 URL이다.
          referrer: request.headers.get("referer") ?? undefined,

          /*
            동의 로그(D8). 필수 동의는 위 스키마를 통과한 시점에 확정돼 있으므로
            여기서는 버전만 박는다 — 동의 일시는 createdAt이 정본이다.
          */
          privacyConsentVersion: PRIVACY_CONSENT_VERSION,
          ageConfirmed: true,
          marketingOptIn,
          marketingOptInAt: marketingOptIn ? new Date() : null,
          marketingConsentVersion: marketingOptIn ? MARKETING_CONSENT_VERSION : null,
        },
      });
    } catch (error) {
      // 조회와 생성 사이에 같은 이메일이 들어온 경우(동시 요청).
      // 유니크 제약이 최종 방어선이고, 사용자에게는 여전히 성공이다.
      const code = (error as { code?: string }).code;
      if (code !== "P2002") throw error;
    }
  } else if (marketingOptIn && !existing.marketingOptIn) {
    /*
      이미 신청한 사람이 이번엔 마케팅 수신에 동의했다. 새 동의이므로 반영한다.

      반대 방향(기존 동의 → 이번엔 체크 해제)은 일부러 건드리지 않는다.
      이 폼은 철회 수단이 아니라 신청 폼이고, 체크를 안 한 것과 철회 의사를
      밝힌 것은 다르다. 철회의 정본 경로는 메일 하단의 수신거부 링크(M5)이며
      그때 marketingOptOutAt이 찍힌다.
    */
    await prisma.lead.update({
      where: { id: existing.id },
      data: {
        marketingOptIn: true,
        marketingOptInAt: new Date(),
        marketingConsentVersion: MARKETING_CONSENT_VERSION,
        marketingOptOutAt: null,
      },
    });
  }

  return Response.json({ ok: true, seasonSlug: season.slug }, { status: 201 });
}
