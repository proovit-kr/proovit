-- 팀별 레이스 집계(2026-09-26 수연 지시 「팀별 집계로 바꿔」).
-- 레이스 시작 = 그 팀이 s3을 처음 제출한 때. 제출 행의 submitted_at은 재제출 때
-- 덮이므로 칸을 따로 둔다. 비어 있으면 레이스 전이다.
ALTER TABLE "entries" ADD COLUMN "race_started_at" TIMESTAMPTZ(6);

-- 이미 s3을 낸 참가는 그 제출 시각으로 채운다. 재제출로 덮였으면 첫 제출보다 늦은
-- 값이지만 남은 기록 중에서는 그것이 가장 이르다. 임시저장(draft)은 제출이 아니다.
UPDATE "entries" AS e
SET "race_started_at" = s3."first_at"
FROM (
  SELECT "entry_id", MIN("submitted_at") AS "first_at"
  FROM "submissions"
  WHERE "stage_key" = 's3'
    AND "status" IN ('submitted', 'locked')
    AND "submitted_at" IS NOT NULL
  GROUP BY "entry_id"
) AS s3
WHERE s3."entry_id" = e."id";
