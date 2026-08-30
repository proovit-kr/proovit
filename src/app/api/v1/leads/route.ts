import type { NextRequest } from "next/server";
import { z } from "zod";

import {
  MARKETING_CONSENT_VERSION,
  PRIVACY_CONSENT_VERSION,
} from "@/content/consent";
import { apiFail, apiOk } from "@/lib/api";
import { sendLeadWelcome, siteUrl } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { getClientIp, limitByIp } from "@/lib/ratelimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getCurrentSeason } from "@/lib/season";
import { makeUnsubscribeToken } from "@/lib/unsubscribe-token";

/*
  POST /api/v1/leads — API 명세서 v0.2 §1.2

  사전신청 이메일 수집. 시즌1 KPI#1(실측 신청자 수·전환율)의 유일한 원천이고,
  '모두의 창업 2기' 지원서에 들어갈 수요 검증 근거다.

  06 §12가 요구하는 IP 레이트리밋과 Turnstile이 모두 붙어 있다. 레이트리밋은 한 IP의
  연사만 막으므로 분산 IP 봇은 Turnstile이 맡는다.

  다만 **Turnstile은 키가 설정된 뒤부터 실제로 작동한다** — `TURNSTILE_SECRET_KEY`가
  없으면 검증을 건너뛴다. 키를 넣기 전까지는 레이트리밋 한 겹뿐이다.
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
  /*
    만 14세 확인. 통과 조건이지 저장 항목이 아니다 — 종결본이 age_confirmed 컬럼을
    빼면서 이 조항은 문안 A 안에 든 것으로 정리됐고, 어느 문안에 동의했는지는
    privacyConsentVersion이 남긴다. 접수를 막는 역할은 그대로다.
  */
  ageConfirmed: z.literal(true, {
    message: "만 14세 이상만 신청할 수 있어요.",
  }),
  /* 선택 동의. 기본값은 미동의이고, 미동의로도 접수된다(D5). */
  marketingOptIn: z.boolean().default(false),
  /* Turnstile 토큰. 키가 설정되기 전까지는 없어도 통과한다 */
  turnstileToken: z.string().max(2048).optional(),
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(120).optional(),
});

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);

  // 가장 먼저 본다. 본문 파싱도 DB 조회도 하기 전에 끊는 것이 가장 싸다.
  const { success, retryAfterSeconds } = await limitByIp(clientIp);
  if (!success) {
    return apiFail("RATE_LIMITED", "요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.", {
      headers: { "Retry-After": String(retryAfterSeconds) },
    });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return apiFail("INVALID_JSON", "요청 본문을 읽을 수 없습니다.");
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    /* 명세서 §0.3이 검증 실패를 422로 고정했다. 이전엔 400이었다. */
    return apiFail(
      "VALIDATION_FAILED",
      parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    );
  }

  /*
    봇 검증은 동의·형식 검증 다음, DB 조회 앞에 둔다. 형식이 틀린 요청에까지
    Cloudflare를 왕복할 이유가 없고, 반대로 DB를 건드리기 전에는 끝나야 한다.
  */
  const bot = await verifyTurnstile(parsed.data.turnstileToken, clientIp);
  if (!bot.ok) {
    /*
      MISCONFIGURED는 우리 잘못이다 — 시크릿이 틀렸거나 비어 있다. 사용자는
      무엇을 해도 통과할 수 없으므로 "확인란을 완료하라"고 하면 안 된다.
      500을 주는 것도 그래서다: 클라이언트 오류가 아니라 서버 설정 오류이고,
      상태 코드로 남겨야 나중에 원인을 되짚을 수 있다.
    */
    if (bot.reason === "MISCONFIGURED") {
      console.error(
        "[turnstile] 시크릿 키가 유효하지 않습니다. TURNSTILE_SECRET_KEY를 확인하세요.",
      );
      return apiFail(
        "BOT_CHECK_MISCONFIGURED",
        "일시적인 오류예요. 잠시 후 다시 시도해주세요.",
      );
    }

    const message =
      bot.reason === "UNAVAILABLE"
        ? "확인 절차를 완료하지 못했어요. 잠시 후 다시 시도해주세요."
        : "사람인지 확인이 필요해요. 확인란을 완료한 뒤 다시 눌러주세요.";
    return apiFail("BOT_CHECK_FAILED", message);
  }

  const season = await getCurrentSeason();
  if (!season) {
    return apiFail("NO_OPEN_SEASON", "지금은 사전 신청을 받고 있지 않습니다.");
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

  /*
    접수 확인 메일을 보내려면 만들어진 행의 id가 필요하다(수신거부 토큰의 근거).
    중복 신청일 때는 보내지 않는다 — 「접수됐다」는 사실을 알리는 이행 메일이라
    새로 접수됐을 때만 할 말이 있고, 남의 주소로 재신청을 반복해 메일을 쏟아붓는
    길을 열어 두지 않는 쪽이 낫다.
  */
  let createdId: string | null = null;

  if (!existing) {
    try {
      const created = await prisma.lead.create({
        data: {
          email,
          seasonId: season.id,
          utmSource,
          utmMedium,
          utmCampaign,
          // 유입 경로 추적. 개인정보가 아니라 출처 URL이다.
          referrer: request.headers.get("referer") ?? undefined,

          /*
            동의 로그(D8). 필수 동의는 위 스키마를 통과한 시점에 확정돼 있다.

            privacyConsentAt은 2026-08-13에 종결본이 요구해 생긴 칸이다.
            지금은 createdAt과 같은 값이지만 둘은 다른 질문에 답한다 —
            createdAt은 "행이 언제 생겼나", 이쪽은 "언제 동의했나"다.
            운영자가 대신 넣는 행이 생기면 갈라진다.
          */
          privacyConsentAt: new Date(),
          privacyConsentVersion: PRIVACY_CONSENT_VERSION,
          marketingOptIn,
          marketingConsentVersion: marketingOptIn ? MARKETING_CONSENT_VERSION : null,
        },
        select: { id: true },
      });
      createdId = created.id;
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
      그때 unsubscribedAt이 찍힌다.
    */
    await prisma.lead.update({
      where: { id: existing.id },
      data: {
        marketingOptIn: true,
        marketingConsentVersion: MARKETING_CONSENT_VERSION,
        unsubscribedAt: null,
      },
    });
  }

  /*
    ⚠️ 메일은 **접수를 저장한 뒤에, 응답을 막지 않고** 보낸다.

    접수는 이미 끝났고 그 숫자가 KPI#1의 원천이다. 메일이 안 나갔다고 접수를
    실패로 돌리면 세어야 할 것을 잃는다. sendLeadWelcome은 예외를 던지지 않고
    실패를 로그로만 남긴다(키가 없으면 조용히 건너뛴다).
  */
  if (createdId) {
    /*
      ⚠️ 통째로 감싼다. sendLeadWelcome은 스스로 던지지 않지만
      makeUnsubscribeToken은 AUTH_SECRET이 없으면 던진다 — 그러면 리드를
      저장해 놓고 500을 돌려주게 되어, 사용자는 실패한 줄 알고 다시 누르고
      우리는 「접수됐는데 안 됐다고 나온다」는 제보를 받는다.
    */
    try {
      const url = `${siteUrl()}/api/v1/unsubscribe?t=${encodeURIComponent(
        makeUnsubscribeToken(createdId),
      )}`;
      await sendLeadWelcome({
        email,
        seasonTitle: season.title,
        unsubscribeUrl: url,
      });
    } catch (error) {
      console.error("[leads] 접수 확인 메일을 보내지 못했습니다.", error);
    }
  }

  return apiOk({ seasonSlug: season.slug }, { status: 201 });
}
