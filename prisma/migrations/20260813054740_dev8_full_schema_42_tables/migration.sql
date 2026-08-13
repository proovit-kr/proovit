-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "SeasonPhase" AS ENUM ('draft', 'pre_apply', 'recruiting', 'w1_demand', 'gate1_review', 'w2_build', 'race', 'gate2_review', 'awarded', 'archived');

-- CreateEnum
CREATE TYPE "HostnameType" AS ENUM ('proovit_sub', 'custom');

-- CreateEnum
CREATE TYPE "NotifChannel" AS ENUM ('inapp', 'email', 'alimtalk');

-- CreateEnum
CREATE TYPE "AbuseStatus" AS ENUM ('flagged', 'appealed', 'upheld', 'overturned');

-- CreateEnum
CREATE TYPE "OauthProvider" AS ENUM ('kakao', 'google');

-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('public', 'b2b', 'edu');

-- CreateEnum
CREATE TYPE "DeployStatus" AS ENUM ('pending', 'verifying', 'active', 'failed', 'disabled');

-- CreateEnum
CREATE TYPE "SslStatus" AS ENUM ('pending', 'issuing', 'active', 'expired', 'failed');

-- CreateEnum
CREATE TYPE "ExclusionReason" AS ENUM ('self_payment', 'team_member', 'related_party', 'test', 'under_minimum');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('queued', 'sent', 'delivered', 'bounced', 'failed');

-- CreateEnum
CREATE TYPE "ViolationType" AS ENUM ('report_late', 'evidence_ignored', 'tester_skip');

-- CreateEnum
CREATE TYPE "PrizeType" AS ENUM ('cash', 'credit', 'incubation');

-- CreateEnum
CREATE TYPE "SanctionStage" AS ENUM ('warning', 'week_invalidated', 'disqualified', 'award_revoked');

-- CreateEnum
CREATE TYPE "SanctionReason" AS ENUM ('bot_traffic', 'multi_account', 'paid_signup', 'evidence_forged', 'undisclosed_ad', 'attack_or_spam', 'false_representation');

-- CreateEnum
CREATE TYPE "SanctionStatus" AS ENUM ('pending', 'applied', 'withdrawn');

-- CreateEnum
CREATE TYPE "MetricStorage" AS ENUM ('column', 'extra');

-- CreateEnum
CREATE TYPE "MetricSource" AS ENUM ('edge', 'manual', 'ga4');

-- CreateEnum
CREATE TYPE "JudgmentResult" AS ENUM ('pass', 'revision', 'fail');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "StageKey" AS ENUM ('s1', 's2', 's3', 's4', 's5');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('draft', 'submitted', 'locked');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('pending', 'paid', 'refunded', 'forfeited');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('toss', 'portone');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('pending', 'verified', 'failed', 'disabled');

-- CreateEnum
CREATE TYPE "CreditStatus" AS ENUM ('issued', 'claimed', 'expired');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('new', 'contacted', 'converted', 'unsubscribed');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('paid', 'canceled', 'refunded');

-- CreateEnum
CREATE TYPE "AwardType" AS ENUM ('overall', 'traffic', 'revenue', 'growth', 'special');

-- ═════════════════════════════════════════════════════════════
-- 여기서부터 CreateTable 직전까지는 손으로 쓴 구간이다.
-- Prisma가 자동 생성을 거부한 것 넷 — 컬럼 rename · ENUM 타입 교체 ·
-- NOT NULL 컬럼 추가 · 값 매핑. 자동 생성본을 그대로 쓰면 데이터가 사라진다.
-- ═════════════════════════════════════════════════════════════

-- AlterEnum: EntryStage — 9값 → 7값. 겹치는 값이 applied·completed 둘뿐이라
-- 값 집합을 통째로 갈아끼운다. 옛 진도를 새 스테이지로 옮기는 표가 아래 CASE다.
-- (gate1_failed는 진도가 아니라 결과라 s2에 세운다 — 탈락 여부는 entries.status가 갖는다)
BEGIN;
CREATE TYPE "EntryStage_new" AS ENUM ('applied', 's1', 's2', 's3', 's4', 's5', 'completed');
ALTER TABLE "entries" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "entries" ALTER COLUMN "stage" TYPE "EntryStage_new" USING (
  CASE "stage"::text
    WHEN 'onboarded'        THEN 's1'
    WHEN 'demand_submitted' THEN 's2'
    WHEN 'gate1_revision'   THEN 's2'
    WHEN 'gate1_failed'     THEN 's2'
    WHEN 'gate1_passed'     THEN 's3'
    WHEN 'deployed'         THEN 's3'
    WHEN 'final_submitted'  THEN 's5'
    ELSE "stage"::text
  END::"EntryStage_new"
);
ALTER TYPE "EntryStage" RENAME TO "EntryStage_old";
ALTER TYPE "EntryStage_new" RENAME TO "EntryStage";
DROP TYPE "EntryStage_old";
ALTER TABLE "entries" ALTER COLUMN "stage" SET DEFAULT 'applied';
COMMIT;

-- AlterEnum: EntryStatus — eliminated(게이트 미통과) 추가.
-- disqualified(규칙 위반 실격)와 한 값으로 묶으면 안 된다. 소명 절차가 다르다.
ALTER TYPE "EntryStatus" ADD VALUE 'eliminated' AFTER 'active';

-- AlterTable: seasons — 컬럼명 교체는 DROP/ADD가 아니라 RENAME이다.
-- Prisma는 rename을 알아보지 못해 자동 생성본이 시즌 이름과 일정을 버린다.
ALTER TABLE "seasons" RENAME COLUMN "name" TO "title";
ALTER TABLE "seasons" RENAME COLUMN "start_at" TO "starts_at";
ALTER TABLE "seasons" RENAME COLUMN "end_at" TO "ends_at";

-- phase: 대문자 9값(season_phase) → 소문자 10값(SeasonPhase).
-- ⚠️ RECRUITING의 행선지가 둘이다. 옛 모델에는 '사전신청만 받는 구간'이 없어
--    phase=RECRUITING + recruit_start_at 비교로 갈랐는데, 새 모델은 pre_apply가
--    그 구간을 이름으로 갖는다. 모집 시작 전이면 pre_apply, 이미 시작했으면 recruiting.
--    이 판정이 recruit_start_at을 지우기 전에 끝나야 해서 순서가 여기다.
--    그냥 lower()로 옮기면 시즌1이 곧바로 recruiting이 되어 /apply가 열린다.
ALTER TABLE "seasons" ADD COLUMN "phase_new" "SeasonPhase" NOT NULL DEFAULT 'draft';
UPDATE "seasons" SET "phase_new" = (
  CASE
    WHEN "phase"::text = 'RECRUITING'
     AND ("recruit_start_at" IS NULL OR "recruit_start_at" > now()) THEN 'pre_apply'
    ELSE lower("phase"::text)
  END
)::"SeasonPhase";
ALTER TABLE "seasons" DROP COLUMN "phase";
ALTER TABLE "seasons" RENAME COLUMN "phase_new" TO "phase";

-- 모집 기간 두 칸은 season_schedules로 옮겨간다(ADR-010). 여기서 지운다.
ALTER TABLE "seasons"
  DROP COLUMN "recruit_start_at",
  DROP COLUMN "recruit_end_at",
  ADD COLUMN "deposit_amount" BIGINT NOT NULL DEFAULT 30000,
  ADD COLUMN "organization_id" UUID,
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "title" TYPE VARCHAR(100),
  ALTER COLUMN "slug" TYPE VARCHAR(60),
  ALTER COLUMN "theme" TYPE VARCHAR(100);

-- DropEnum: 옛 phase 타입. 위에서 컬럼을 떼어낸 뒤라야 지워진다.
DROP TYPE "season_phase";

-- AlterTable: oauth_accounts — VARCHAR(20) → ENUM.
-- DROP/ADD면 기존 소셜 계정 연결이 끊겨 그 사람들이 로그인하는 순간 새 계정이 생긴다.
ALTER TABLE "oauth_accounts"
  ALTER COLUMN "provider" TYPE "OauthProvider" USING lower("provider")::"OauthProvider";

-- AlterTable: leads
ALTER TABLE "leads"
  ADD COLUMN "source_channel" VARCHAR(60),
  ADD COLUMN "status" "LeadStatus" NOT NULL DEFAULT 'new',
  ADD COLUMN "unsubscribed_at" TIMESTAMPTZ(6),
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- 마케팅 철회 시각은 opt_in_at/opt_out_at 두 칸에서 unsubscribed_at 한 칸으로 합쳐졌다.
-- 값이 있는 행이 아직 없어(수신거부 경로가 M5에 붙는다) 옮길 데이터가 없다.
ALTER TABLE "leads"
  DROP COLUMN "marketing_opt_in_at",
  DROP COLUMN "marketing_opt_out_at";

-- 만 14세 확인은 문안 A 안에 든 조항이라 별도 칸을 두지 않는다.
-- 어느 문안에 동의했는지가 privacy_consent_version에 남으면 그 조항도 함께 특정된다.
-- 접수를 막는 검증은 API에 그대로 있다(z.literal(true)).
ALTER TABLE "leads" DROP COLUMN "age_confirmed";

-- privacy_consent_version은 종결본에서 선택값이다.
ALTER TABLE "leads" ALTER COLUMN "privacy_consent_version" DROP NOT NULL;

-- privacy_consent_at은 NOT NULL인데 기존 행에 값이 없다.
-- 필수 동의 없이는 행이 만들어지지 않는 구조라 created_at이 곧 동의 시각이다.
ALTER TABLE "leads" ADD COLUMN "privacy_consent_at" TIMESTAMPTZ(6);
UPDATE "leads" SET "privacy_consent_at" = "created_at";
ALTER TABLE "leads" ALTER COLUMN "privacy_consent_at" SET NOT NULL;

-- updated_at은 @updatedAt이라 DB 기본값을 두지 않는다(다른 표와 같은 규칙).
-- 기존 행만 채우고 기본값은 도로 뺀다 — 남겨두면 다음 diff가 드리프트로 잡는다.
ALTER TABLE "leads" ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "leads" SET "updated_at" = "created_at";
ALTER TABLE "leads" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable: users — 자체 회원가입 폐기(2026-08-12)로 비밀번호 컬럼을 지운다.
-- 값이 들어간 적이 없다(소셜 전용으로만 열려 있었다).
ALTER TABLE "users" DROP COLUMN "password_hash";

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "type" "OrgType",
    "contact_email" CITEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "team_id" UUID NOT NULL,
    "invite_code" VARCHAR(12) NOT NULL,
    "email" CITEXT,
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "season_id" UUID NOT NULL,
    "stage_key" "StageKey" NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "is_gate" BOOLEAN NOT NULL DEFAULT false,
    "opens_at" TIMESTAMPTZ(6),
    "closes_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "season_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "season_id" UUID NOT NULL,
    "phase" "SeasonPhase" NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "applied_at" TIMESTAMPTZ(6),
    "applied_by" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "season_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'pending',
    "pg_payment_key" VARCHAR(255),
    "paid_at" TIMESTAMPTZ(6),
    "refunded_at" TIMESTAMPTZ(6),
    "refund_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostnames" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_id" UUID NOT NULL,
    "hostname" VARCHAR(255) NOT NULL,
    "type" "HostnameType" NOT NULL DEFAULT 'proovit_sub',
    "origin_url" TEXT,
    "cf_hostname_id" VARCHAR(255),
    "worker_route" VARCHAR(255),
    "deploy_status" "DeployStatus" NOT NULL DEFAULT 'pending',
    "ssl_status" "SslStatus",
    "ownership_verified_at" TIMESTAMPTZ(6),
    "bypass_detected_at" TIMESTAMPTZ(6),
    "last_checked_at" TIMESTAMPTZ(6),
    "analytics_property_id" VARCHAR(40),
    "analytics_access_granted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hostnames_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_integrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "merchant_id" VARCHAR(120),
    "readonly_key_enc" TEXT,
    "webhook_secret_enc" TEXT,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'pending',
    "verified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_id" UUID NOT NULL,
    "contact_hash" VARCHAR(64) NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "source_host" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_id" UUID NOT NULL,
    "stage_key" "StageKey" NOT NULL,
    "week" SMALLINT NOT NULL DEFAULT 0,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'draft',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "evidence_urls" TEXT[],
    "revision_due_at" TIMESTAMPTZ(6),
    "submitted_by" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judgments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "submission_id" UUID NOT NULL,
    "result" "JudgmentResult" NOT NULL,
    "auto_score" DECIMAL(10,4),
    "score_breakdown" JSONB,
    "formula_version" VARCHAR(20),
    "ai_report" JSONB,
    "feedback" TEXT,
    "judged_by" UUID,
    "judged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "judgments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_id" UUID NOT NULL,
    "target_type" VARCHAR(20) NOT NULL,
    "target_id" UUID NOT NULL,
    "reason_text" TEXT NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "response_due_at" TIMESTAMPTZ(6),
    "response_text" TEXT,
    "responded_at" TIMESTAMPTZ(6),
    "responded_by" UUID,
    "corrected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(40) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "unit" VARCHAR(20),
    "storage" "MetricStorage" NOT NULL DEFAULT 'extra',
    "column_name" VARCHAR(40),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "metric_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_daily" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "entry_id" UUID NOT NULL,
    "metric_date" DATE NOT NULL,
    "raw_visitors" INTEGER NOT NULL DEFAULT 0,
    "valid_visitors" INTEGER NOT NULL DEFAULT 0,
    "pageviews" INTEGER NOT NULL DEFAULT 0,
    "bot_filtered" INTEGER NOT NULL DEFAULT 0,
    "signups" INTEGER NOT NULL DEFAULT 0,
    "revenue" BIGINT NOT NULL DEFAULT 0,
    "source" "MetricSource" NOT NULL DEFAULT 'edge',
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "spike_trimmed" INTEGER NOT NULL DEFAULT 0,
    "batch_at" TIMESTAMPTZ(6),
    "manual_review_passed" BOOLEAN NOT NULL DEFAULT true,
    "reviewed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "metric_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_extra_daily" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "entry_id" UUID NOT NULL,
    "metric_date" DATE NOT NULL,
    "definition_id" UUID NOT NULL,
    "value" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "source" "MetricSource" NOT NULL DEFAULT 'edge',
    "batch_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "metric_extra_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_channel_daily" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "entry_id" UUID NOT NULL,
    "metric_date" DATE NOT NULL,
    "channel" VARCHAR(60) NOT NULL,
    "visitors" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_channel_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_hourly" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "entry_id" UUID NOT NULL,
    "bucket_at" TIMESTAMPTZ(6) NOT NULL,
    "valid_visitors" INTEGER NOT NULL DEFAULT 0,
    "pageviews" INTEGER NOT NULL DEFAULT 0,
    "revenue" BIGINT NOT NULL DEFAULT 0,
    "batch_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_hourly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "entry_id" UUID NOT NULL,
    "provider_tx_id" VARCHAR(255) NOT NULL,
    "related_tx_id" VARCHAR(255),
    "amount" BIGINT NOT NULL,
    "status" "TransactionStatus" NOT NULL,
    "paid_at" TIMESTAMPTZ(6) NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "payer_hash" VARCHAR(64),
    "is_excluded" BOOLEAN NOT NULL DEFAULT false,
    "exclusion_reason" "ExclusionReason",
    "excluded_by" UUID,
    "excluded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboard_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "season_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DECIMAL(12,4) NOT NULL,
    "valid_visitors_total" INTEGER NOT NULL DEFAULT 0,
    "revenue_total" BIGINT NOT NULL DEFAULT 0,
    "is_final" BOOLEAN NOT NULL DEFAULT false,
    "score_breakdown" JSONB NOT NULL DEFAULT '{}',
    "formula_version" VARCHAR(20),
    "is_award_eligible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leaderboard_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tester_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "season_id" UUID NOT NULL,
    "week" SMALLINT NOT NULL,
    "tester_entry_id" UUID NOT NULL,
    "target_entry_id" UUID NOT NULL,
    "tracking_token" VARCHAR(32) NOT NULL,
    "visited_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tester_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tester_feedbacks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assignment_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "rating" SMALLINT,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tester_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(80) NOT NULL,
    "benefit_desc" TEXT,
    "website_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sponsor_id" UUID NOT NULL,
    "season_id" UUID,
    "unlock_stage" "EntryStage" NOT NULL,
    "code" VARCHAR(120) NOT NULL,
    "status" "CreditStatus" NOT NULL DEFAULT 'issued',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "credit_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_issuances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "credit_code_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "sponsor_id" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_issuances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link_url" TEXT,
    "channel" "NotifChannel" NOT NULL DEFAULT 'inapp',
    "sent_at" TIMESTAMPTZ(6),
    "delivery_status" "DeliveryStatus",
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abuse_flags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_id" UUID NOT NULL,
    "ip_hash" VARCHAR(64),
    "bot_score" DECIMAL(5,2),
    "reason" VARCHAR(120),
    "status" "AbuseStatus" NOT NULL DEFAULT 'flagged',
    "adjusted_visitors" INTEGER,
    "appeal_text" TEXT,
    "appealed_at" TIMESTAMPTZ(6),
    "resolution_note" TEXT,
    "reviewed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "abuse_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_violations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_id" UUID NOT NULL,
    "week" SMALLINT NOT NULL,
    "type" "ViolationType" NOT NULL,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sanctions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_id" UUID NOT NULL,
    "stage" "SanctionStage" NOT NULL,
    "reason" "SanctionReason" NOT NULL,
    "detail" TEXT NOT NULL,
    "source_type" VARCHAR(20),
    "source_id" UUID,
    "week" SMALLINT,
    "correction_deadline" TIMESTAMPTZ(6),
    "appeal_deadline_at" TIMESTAMPTZ(6),
    "appeal_text" TEXT,
    "appealed_at" TIMESTAMPTZ(6),
    "status" "SanctionStatus" NOT NULL DEFAULT 'pending',
    "award_id" UUID,
    "clawback_amount" BIGINT,
    "decided_by" UUID,
    "applied_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sanctions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ip_blocklist" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ip_hash" VARCHAR(64) NOT NULL,
    "reason" VARCHAR(120),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ip_blocklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "awards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "season_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "rank" INTEGER,
    "prize_type" "PrizeType",
    "prize_desc" TEXT,
    "amount" BIGINT,
    "award_type" "AwardType" NOT NULL DEFAULT 'overall',
    "awarded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "awards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(60) NOT NULL,
    "target_type" VARCHAR(40) NOT NULL,
    "target_id" UUID,
    "meta" JSONB,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_invitations_invite_code_key" ON "team_invitations"("invite_code");

-- CreateIndex
CREATE UNIQUE INDEX "stages_season_id_stage_key_key" ON "stages"("season_id", "stage_key");

-- CreateIndex
CREATE INDEX "season_schedules_season_id_starts_at_idx" ON "season_schedules"("season_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "season_schedules_season_id_phase_key" ON "season_schedules"("season_id", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_entry_id_key" ON "deposits"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "hostnames_entry_id_key" ON "hostnames"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "hostnames_hostname_key" ON "hostnames"("hostname");

-- CreateIndex
CREATE UNIQUE INDEX "payment_integrations_entry_id_key" ON "payment_integrations"("entry_id");

-- CreateIndex
CREATE INDEX "entry_leads_entry_id_verified_at_idx" ON "entry_leads"("entry_id", "verified_at");

-- CreateIndex
CREATE UNIQUE INDEX "entry_leads_entry_id_contact_hash_key" ON "entry_leads"("entry_id", "contact_hash");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_entry_id_stage_key_week_key" ON "submissions"("entry_id", "stage_key", "week");

-- CreateIndex
CREATE INDEX "appeals_target_type_target_id_idx" ON "appeals"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "appeals_entry_id_idx" ON "appeals"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "metric_definitions_key_key" ON "metric_definitions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "metric_daily_entry_id_metric_date_key" ON "metric_daily"("entry_id", "metric_date");

-- CreateIndex
CREATE INDEX "metric_extra_daily_definition_id_idx" ON "metric_extra_daily"("definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "metric_extra_daily_entry_id_metric_date_definition_id_key" ON "metric_extra_daily"("entry_id", "metric_date", "definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "metric_channel_daily_entry_id_metric_date_channel_key" ON "metric_channel_daily"("entry_id", "metric_date", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "metric_hourly_entry_id_bucket_at_key" ON "metric_hourly"("entry_id", "bucket_at");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_provider_tx_id_key" ON "transactions"("provider_tx_id");

-- CreateIndex
CREATE INDEX "transactions_entry_id_paid_at_idx" ON "transactions"("entry_id", "paid_at");

-- CreateIndex
CREATE INDEX "transactions_entry_id_payer_hash_idx" ON "transactions"("entry_id", "payer_hash");

-- CreateIndex
CREATE INDEX "leaderboard_snapshots_season_id_snapshot_date_rank_idx" ON "leaderboard_snapshots"("season_id", "snapshot_date", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "leaderboard_snapshots_season_id_entry_id_snapshot_date_key" ON "leaderboard_snapshots"("season_id", "entry_id", "snapshot_date");

-- CreateIndex
CREATE UNIQUE INDEX "tester_assignments_tracking_token_key" ON "tester_assignments"("tracking_token");

-- CreateIndex
CREATE UNIQUE INDEX "tester_assignments_week_tester_entry_id_target_entry_id_key" ON "tester_assignments"("week", "tester_entry_id", "target_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "tester_feedbacks_assignment_id_key" ON "tester_feedbacks"("assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_codes_code_key" ON "credit_codes"("code");

-- CreateIndex
CREATE INDEX "credit_codes_sponsor_id_status_idx" ON "credit_codes"("sponsor_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "credit_issuances_credit_code_id_key" ON "credit_issuances"("credit_code_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_issuances_entry_id_sponsor_id_key" ON "credit_issuances"("entry_id", "sponsor_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "abuse_flags_entry_id_status_idx" ON "abuse_flags"("entry_id", "status");

-- CreateIndex
CREATE INDEX "compliance_violations_entry_id_type_idx" ON "compliance_violations"("entry_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_violations_entry_id_week_type_key" ON "compliance_violations"("entry_id", "week", "type");

-- CreateIndex
CREATE INDEX "sanctions_entry_id_stage_idx" ON "sanctions"("entry_id", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "ip_blocklist_ip_hash_key" ON "ip_blocklist"("ip_hash");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- oauth_accounts(provider, provider_account_id) 유니크 인덱스는 다시 만들지 않는다.
-- 자동 생성본은 provider를 DROP/ADD하는 전제라 인덱스도 새로 만들었는데,
-- 위에서 타입만 바꿔 끼웠으므로 인덱스가 그대로 살아 있다.

-- CreateIndex
-- seasons.phase는 컬럼을 갈아끼우며 인덱스도 같이 날아갔다. 여기서 다시 세운다.
CREATE INDEX "seasons_phase_idx" ON "seasons"("phase");

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stages" ADD CONSTRAINT "stages_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_schedules" ADD CONSTRAINT "season_schedules_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_schedules" ADD CONSTRAINT "season_schedules_applied_by_fkey" FOREIGN KEY ("applied_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostnames" ADD CONSTRAINT "hostnames_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_integrations" ADD CONSTRAINT "payment_integrations_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_leads" ADD CONSTRAINT "entry_leads_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judgments" ADD CONSTRAINT "judgments_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judgments" ADD CONSTRAINT "judgments_judged_by_fkey" FOREIGN KEY ("judged_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_responded_by_fkey" FOREIGN KEY ("responded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_daily" ADD CONSTRAINT "metric_daily_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_daily" ADD CONSTRAINT "metric_daily_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_extra_daily" ADD CONSTRAINT "metric_extra_daily_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_extra_daily" ADD CONSTRAINT "metric_extra_daily_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "metric_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_channel_daily" ADD CONSTRAINT "metric_channel_daily_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_hourly" ADD CONSTRAINT "metric_hourly_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_excluded_by_fkey" FOREIGN KEY ("excluded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_snapshots" ADD CONSTRAINT "leaderboard_snapshots_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_snapshots" ADD CONSTRAINT "leaderboard_snapshots_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tester_assignments" ADD CONSTRAINT "tester_assignments_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tester_assignments" ADD CONSTRAINT "tester_assignments_tester_entry_id_fkey" FOREIGN KEY ("tester_entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tester_assignments" ADD CONSTRAINT "tester_assignments_target_entry_id_fkey" FOREIGN KEY ("target_entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tester_feedbacks" ADD CONSTRAINT "tester_feedbacks_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "tester_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_codes" ADD CONSTRAINT "credit_codes_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_codes" ADD CONSTRAINT "credit_codes_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_issuances" ADD CONSTRAINT "credit_issuances_credit_code_id_fkey" FOREIGN KEY ("credit_code_id") REFERENCES "credit_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_issuances" ADD CONSTRAINT "credit_issuances_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_issuances" ADD CONSTRAINT "credit_issuances_sponsor_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "sponsors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abuse_flags" ADD CONSTRAINT "abuse_flags_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abuse_flags" ADD CONSTRAINT "abuse_flags_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_violations" ADD CONSTRAINT "compliance_violations_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_violations" ADD CONSTRAINT "compliance_violations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_award_id_fkey" FOREIGN KEY ("award_id") REFERENCES "awards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ip_blocklist" ADD CONSTRAINT "ip_blocklist_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "awards" ADD CONSTRAINT "awards_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "awards" ADD CONSTRAINT "awards_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═════════════════════════════════════════════════════════════
-- Prisma가 표현하지 못하는 제약. 스키마 파일 하단 주석과 짝이다.
-- migrate reset·새 환경 구축에서도 따라오게 하려고 마이그레이션에 직접 넣는다.
--
-- 종결본 주석은 이런 제약을 2건으로 적어놓았지만 여기 있는 건 하나다.
-- 나머지 하나("팀당 팀장 1명" 부분 유니크 인덱스)는 team_members를 만든
-- 20260812133738_add_team_entry_tables에 이미 들어 있다. 같은 이름을 두 번
-- 만들면 42P07로 마이그레이션이 통째로 멈춘다.
-- ═════════════════════════════════════════════════════════════

-- 엣지 집계본은 배치 시각이 반드시 있어야 한다.
-- 없으면 "더 최신 배치만 덮어쓴다"는 역행 방어가 통째로 무력화된다.
ALTER TABLE "metric_daily"
  ADD CONSTRAINT "metric_daily_batch_at_required"
  CHECK ("source" <> 'edge' OR "batch_at" IS NOT NULL);
