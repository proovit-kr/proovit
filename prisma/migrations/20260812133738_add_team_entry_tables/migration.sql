-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('leader', 'member');

-- CreateEnum
CREATE TYPE "EntryStage" AS ENUM ('applied', 'onboarded', 'demand_submitted', 'gate1_revision', 'gate1_passed', 'gate1_failed', 'deployed', 'final_submitted', 'completed');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('active', 'disqualified', 'withdrawn');

-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('payment', 'inquiry');

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(60) NOT NULL,
    "is_solo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "team_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "season_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "season_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "track_id" UUID,
    "stage" "EntryStage" NOT NULL DEFAULT 'applied',
    "status" "EntryStatus" NOT NULL DEFAULT 'active',
    "is_tester" BOOLEAN NOT NULL DEFAULT false,
    "idea_title" VARCHAR(120) NOT NULL,
    "idea_summary" TEXT,
    "service_url" TEXT,
    "charge_type" "ChargeType" NOT NULL DEFAULT 'payment',
    "applied_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_members_team_id_user_id_key" ON "team_members"("team_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracks_season_id_name_key" ON "tracks"("season_id", "name");

-- CreateIndex
CREATE INDEX "entries_season_id_stage_idx" ON "entries"("season_id", "stage");

-- CreateIndex
CREATE INDEX "entries_season_id_status_idx" ON "entries"("season_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "entries_season_id_team_id_key" ON "entries"("season_id", "team_id");

-- 팀당 팀장은 1명이다.
-- Prisma가 표현하지 못하는 제약이라 손으로 넣는다(종결본 파일 하단 주석 2번 항목).
-- 없으면 이양·복구 과정에서 한 팀에 팀장이 둘 생기고, 쓰기 권한이 팀장에게만
-- 있으므로 그 순간 누가 제출한 것인지가 갈린다.
CREATE UNIQUE INDEX "team_members_one_leader" ON "team_members" ("team_id") WHERE "role" = 'leader';

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entries" ADD CONSTRAINT "entries_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entries" ADD CONSTRAINT "entries_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entries" ADD CONSTRAINT "entries_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
