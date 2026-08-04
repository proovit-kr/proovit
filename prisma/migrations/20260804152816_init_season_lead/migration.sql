-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "season_phase" AS ENUM ('DRAFT', 'RECRUITING', 'W1_DEMAND', 'GATE1_REVIEW', 'W2_BUILD', 'RACE', 'GATE2_REVIEW', 'AWARDED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "seasons" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "theme" VARCHAR(120),
    "phase" "season_phase" NOT NULL DEFAULT 'DRAFT',
    "feature_flags" JSONB NOT NULL DEFAULT '{}',
    "scoring_config" JSONB NOT NULL DEFAULT '{}',
    "recruit_start_at" TIMESTAMPTZ(6),
    "recruit_end_at" TIMESTAMPTZ(6),
    "start_at" TIMESTAMPTZ(6),
    "end_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "season_id" UUID NOT NULL,
    "utm_source" VARCHAR(120),
    "utm_medium" VARCHAR(120),
    "utm_campaign" VARCHAR(120),
    "referrer" TEXT,
    "notified_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seasons_slug_key" ON "seasons"("slug");

-- CreateIndex
CREATE INDEX "seasons_phase_idx" ON "seasons"("phase");

-- CreateIndex
CREATE INDEX "leads_created_at_idx" ON "leads"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "leads_season_id_email_key" ON "leads"("season_id", "email");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
