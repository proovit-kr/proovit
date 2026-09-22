-- 혜택과 크레딧 화면(시안 ver4 #scr-credits)이 그리는 값 셋.
--   sponsors.mark            워드마크 칸의 글자 하나(「R」·「▲」)
--   credit_offers.howto_url  「적용 방법」 링크
--   credit_offers.redeem_note 발송 줄의 적용 안내 한 토막
ALTER TABLE "sponsors" ADD COLUMN "mark" VARCHAR(4);
ALTER TABLE "credit_offers" ADD COLUMN "howto_url" TEXT;
ALTER TABLE "credit_offers" ADD COLUMN "redeem_note" VARCHAR(120);
