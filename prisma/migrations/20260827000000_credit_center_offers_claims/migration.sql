-- 크레딧 센터 — 13 크레딧 센터 설계서 v0.1(2026.08.22) 6장 데이터 모델.
--
-- 옛 credit_codes/credit_issuances는 "스폰서 하나 = 혜택 하나"를 가정했다.
-- 설계서가 고정한 것은 카드(C1~C4)가 먼저 있고 스폰서가 나중에 붙는 구조다 —
-- 제휴 0건이어도 혜택 탭은 열리고 폴백을 보여줘야 하므로 카드가 스폰서에
-- 매달려 있으면 안 된다. 두 테이블 다 비어 있어(기능 미출시) 옮길 데이터가 없다.

-- CreateEnum
CREATE TYPE "CreditKind" AS ENUM ('c1', 'c2', 'c3', 'c4');

-- CreateEnum
CREATE TYPE "CreditOfferStatus" AS ENUM ('negotiating', 'active', 'ended');

-- CreateEnum
CREATE TYPE "CreditUnlockEvent" AS ENUM ('s1_submitted', 'gate1_passed', 'deploy_verified', 'final_confirmed');

-- CreateEnum
CREATE TYPE "CreditDelivery" AS ENUM ('code_pool', 'invite_link', 'email_list', 'manual');

-- CreateEnum
CREATE TYPE "CreditClaimStatus" AS ENUM ('available', 'scheduled', 'delivered', 'confirmed', 'expired');

-- CreateEnum
CREATE TYPE "CreditDeliveredVia" AS ENUM ('email', 'manual');

-- DropForeignKey
ALTER TABLE "credit_issuances" DROP CONSTRAINT "credit_issuances_credit_code_id_fkey";
ALTER TABLE "credit_issuances" DROP CONSTRAINT "credit_issuances_entry_id_fkey";
ALTER TABLE "credit_issuances" DROP CONSTRAINT "credit_issuances_sponsor_id_fkey";
ALTER TABLE "credit_codes" DROP CONSTRAINT "credit_codes_sponsor_id_fkey";
ALTER TABLE "credit_codes" DROP CONSTRAINT "credit_codes_season_id_fkey";

-- DropTable
DROP TABLE "credit_issuances";

-- AlterTable
ALTER TABLE "sponsors" ADD COLUMN "logo_url" TEXT;

-- CreateTable
CREATE TABLE "credit_offers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "season_id" UUID NOT NULL,
    "sponsor_id" UUID,
    "kind" "CreditKind" NOT NULL,
    "status" "CreditOfferStatus" NOT NULL DEFAULT 'negotiating',
    "unlock_event" "CreditUnlockEvent" NOT NULL,
    "delivery_method" "CreditDelivery" NOT NULL DEFAULT 'manual',
    "release_date" TIMESTAMPTZ(6),
    "valid_until" TIMESTAMPTZ(6),
    "invite_url" TEXT,
    "description" TEXT,
    "value" VARCHAR(60),
    "fallback_url" TEXT,
    "fallback_items" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "credit_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_claims" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "offer_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "status" "CreditClaimStatus" NOT NULL DEFAULT 'available',
    "unlocked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "confirmed_at" TIMESTAMPTZ(6),
    "credit_code_id" UUID,
    "delivered_via" "CreditDeliveredVia",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "credit_claims_pkey" PRIMARY KEY ("id")
);

-- 코드 풀을 카드에 매단다. 비어 있는 테이블이라 NOT NULL을 바로 건다
ALTER TABLE "credit_codes" DROP COLUMN "sponsor_id";
ALTER TABLE "credit_codes" DROP COLUMN "season_id";
ALTER TABLE "credit_codes" DROP COLUMN "unlock_stage";
ALTER TABLE "credit_codes" ADD COLUMN "offer_id" UUID NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "credit_offers_season_id_kind_key" ON "credit_offers"("season_id", "kind");
CREATE INDEX "credit_offers_season_id_status_idx" ON "credit_offers"("season_id", "status");
CREATE UNIQUE INDEX "credit_claims_credit_code_id_key" ON "credit_claims"("credit_code_id");
CREATE UNIQUE INDEX "credit_claims_offer_id_entry_id_key" ON "credit_claims"("offer_id", "entry_id");
CREATE INDEX "credit_claims_entry_id_idx" ON "credit_claims"("entry_id");
CREATE INDEX "credit_codes_offer_id_status_idx" ON "credit_codes"("offer_id", "status");

-- AddForeignKey
ALTER TABLE "credit_offers" ADD CONSTRAINT "credit_offers_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_offers" ADD CONSTRAINT "credit_offers_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "credit_codes" ADD CONSTRAINT "credit_codes_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "credit_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_claims" ADD CONSTRAINT "credit_claims_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "credit_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_claims" ADD CONSTRAINT "credit_claims_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_claims" ADD CONSTRAINT "credit_claims_credit_code_id_fkey" FOREIGN KEY ("credit_code_id") REFERENCES "credit_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 스폰서 정보 제공 선택 동의. 코드 발급을 이메일 명단으로 하는 스폰서가 있어
-- 성명·이메일을 넘겨야 하는데, 그 근거가 되는 동의 종류가 없었다.
ALTER TYPE "ConsentType" ADD VALUE 'sponsor_share';
