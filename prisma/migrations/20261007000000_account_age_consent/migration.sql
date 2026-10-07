-- 과거 동의를 연령 확인으로 소급하지 않는다. 새 확인만 기록한다.
ALTER TYPE "ConsentType" ADD VALUE 'age';
CREATE TYPE "ConsentSource" AS ENUM ('self_declaration', 'dev_fixture');
ALTER TABLE "consents" ADD COLUMN "source" "ConsentSource";
