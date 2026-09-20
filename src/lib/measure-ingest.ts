import { MetricSource } from "@/generated/prisma/enums";
import { hourBucket } from "@/lib/measure";
import { prisma } from "@/lib/prisma";

/*
  엣지가 보낸 방문 이벤트를 지표 표에 올린다.

  ⚠️ **여기서 숫자를 만들지 않는다.** 무엇을 셀지는 엣지가 쿠키를 보고 이미
  정했고(`lib/measure.ts`의 `decideVisit`), 이 파일이 하는 일은 그 판정을
  더하는 것뿐이다. 판정이 두 곳에 있으면 둘이 갈라지는 날 숫자의 근거가 끊긴다.

  올리는 표 셋.
    metric_daily         하루치 — 롤업이 읽는 정본
    metric_hourly        시간치 — 스파이크를 시간 단위로 되짚을 때 쓴다
    metric_channel_daily 채널별 — 기준서 T3(채널 다양성)의 입력

  ⚠️ 증가분(`increment`)으로 쓴다. 엣지가 같은 이벤트를 두 번 보내면 두 번
  더해지므로, 재시도는 **엣지가 하지 않는다**(워커 주석 참조).
*/

export type EdgeVisit = {
  /** 팀명.proovit.kr */
  hostname: string;
  /** 이 요청이 오늘 첫 방문인가 */
  newVisitor: boolean;
  /** 새 세션인가 */
  newSession: boolean;
  /** 이 세션이 두 번째 문서를 열었는가 */
  engaged: boolean;
  /** 유입 채널. 새 세션일 때만 의미가 있다 */
  channel: string;
  /** 엣지가 요청을 받은 시각(ISO) */
  at: string;
};

export type IngestResult = {
  /** 지표에 올린 이벤트 수 */
  accepted: number;
  /** 모르는 호스트·미검증 참가작이라 버린 수 */
  rejected: number;
};

/**
 * 호스트 → 참가작. **소유 확인이 끝난 것만** 센다. 확인 전 주소의 숫자를 쌓으면
 * 나중에 주소가 바뀌었을 때 그 집계가 어느 참가작 것인지 말할 수 없다
 * (measurement-store.ts의 주소 잠금과 같은 이유).
 */
async function entryByHostname(
  hostnames: string[],
): Promise<Map<string, string>> {
  const rows = await prisma.hostname.findMany({
    where: {
      hostname: { in: hostnames },
      ownershipVerifiedAt: { not: null },
    },
    select: { hostname: true, entryId: true },
  });
  return new Map(rows.map((r) => [r.hostname, r.entryId]));
}

/** 하루치 표의 날짜 칸(date)은 서울 날짜의 자정이다 */
function dateOnly(iso: string): Date {
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()),
  );
}

export async function ingestVisits(
  visits: EdgeVisit[],
  now: Date = new Date(),
): Promise<IngestResult> {
  if (visits.length === 0) return { accepted: 0, rejected: 0 };

  const byHost = await entryByHostname([
    ...new Set(visits.map((v) => v.hostname.toLowerCase())),
  ]);

  const writes = [];
  let accepted = 0;
  let rejected = 0;

  for (const visit of visits) {
    const entryId = byHost.get(visit.hostname.toLowerCase());
    if (!entryId) {
      rejected += 1;
      continue;
    }
    accepted += 1;

    const metricDate = dateOnly(visit.at);
    const bucketAt = hourBucket(new Date(visit.at));
    const visitors = visit.newVisitor ? 1 : 0;
    const sessions = visit.newSession ? 1 : 0;

    writes.push(
      prisma.metricDaily.upsert({
        where: { entryId_metricDate: { entryId, metricDate } },
        create: {
          entryId,
          metricDate,
          validVisitors: visitors,
          rawVisitors: visitors,
          pageviews: 1,
          sessions,
          source: MetricSource.edge,
          batchAt: now,
        },
        update: {
          validVisitors: { increment: visitors },
          rawVisitors: { increment: visitors },
          pageviews: { increment: 1 },
          sessions: { increment: sessions },
          /*
            ⚠️ source를 되돌리지 않는다. 운영자가 보정한 날(manual)에 엣지가
            덧쓰면 그 날 숫자가 「자동 집계」로 보이게 된다.
          */
          batchAt: now,
        },
      }),
      prisma.metricHourly.upsert({
        where: { entryId_bucketAt: { entryId, bucketAt } },
        create: {
          entryId,
          bucketAt,
          validVisitors: visitors,
          pageviews: 1,
          batchAt: now,
        },
        update: {
          validVisitors: { increment: visitors },
          pageviews: { increment: 1 },
          batchAt: now,
        },
      }),
    );

    /*
      채널은 **세션이 시작될 때만** 센다. 요청마다 더하면 한 사람이 여러 장을
      본 것이 채널 비중으로 들어가 T3(다양성)가 페이지 수에 흔들린다.
    */
    if (visit.newSession) {
      writes.push(
        prisma.metricChannelDaily.upsert({
          where: {
            entryId_metricDate_channel: {
              entryId,
              metricDate,
              channel: visit.channel,
            },
          },
          create: { entryId, metricDate, channel: visit.channel, visitors: 1 },
          update: { visitors: { increment: 1 } },
        }),
      );
    }
  }

  /*
    한 트랜잭션으로 쓴다. 절반만 들어가면 페이지뷰는 늘고 방문자는 안 는 표가
    남고, 그 차이는 나중에 어느 쪽이 맞는지 알 방법이 없다.
  */
  if (writes.length > 0) await prisma.$transaction(writes);

  return { accepted, rejected };
}
