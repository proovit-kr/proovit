-- 롤업이 하루 한 행을 15분마다 덮어쓴다. snapshot_date는 날짜라
-- "12분 전 갱신"을 말할 수 없어서 마지막 집계 시각 칸을 더한다.
--
-- 기존 행에는 created_at을 넣는다 — 그 행은 그때 만들어진 뒤 고쳐진 적이 없다.
ALTER TABLE "leaderboard_snapshots"
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now();

UPDATE "leaderboard_snapshots" SET "updated_at" = "created_at";
