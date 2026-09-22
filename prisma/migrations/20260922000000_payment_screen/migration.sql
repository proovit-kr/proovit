-- 결제 연동 화면(시안 #scr-payment) 이식.
--
-- entries.inquiry_url — ③ 문의형의 「문의 수단 주소」. 문의형은 결제 키 대신
-- 문의 수단이 수익화 판정의 입구라 그 주소를 참가 기록에 둔다.
ALTER TABLE "entries" ADD COLUMN "inquiry_url" TEXT;

-- payment_integrations.last_tested_at — ② 「연동 테스트」를 마지막으로 누른 시각.
-- 시안 ②의 힌트 「마지막 테스트 10.21 14:02, 성공」이 이 값이다.
ALTER TABLE "payment_integrations" ADD COLUMN "last_tested_at" TIMESTAMPTZ(6);
