-- 운영 어뷰징 화면(시안 ver4 #scr-adm-abuse) — 유형·심각도·증거 요약 열
CREATE TYPE "AbuseSeverity" AS ENUM ('high', 'medium', 'low');

ALTER TABLE "abuse_flags"
  ADD COLUMN "kind" "SanctionReason",
  ADD COLUMN "severity" "AbuseSeverity",
  ADD COLUMN "evidence" VARCHAR(200);
