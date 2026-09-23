-- 소명 화면(시안 ver4 #scr-appeal)의 「증빙 첨부」.
--   appeals.evidence_urls  올린 증빙 파일의 키(제출물의 evidence_urls와 같은 꼴)
ALTER TABLE "appeals" ADD COLUMN "evidence_urls" TEXT[] NOT NULL DEFAULT '{}';
