-- 크레딧 메일 실패 표시(2026-09-30 수연 지시 「네 가지 붙여」).
-- 발급은 됐는데 메일이 못 나간 팀을 운영 콘솔이 칸에 표시하고 재발송하게 한다.
-- 비어 있으면 실패 없음이다. 옛 발급은 결과를 모르므로 비워 둔다.
ALTER TABLE "credit_claims" ADD COLUMN "mail_failed_at" TIMESTAMPTZ(6);
