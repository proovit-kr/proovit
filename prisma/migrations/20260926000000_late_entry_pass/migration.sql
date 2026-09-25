-- 지각 편입 링크 — 모집이 끝난 뒤 문의해 온 사람에게 운영자가 주는 1회용 신청 링크.
-- 근거: PRD OPEN-6 「문의 접수 시 운영자가 수동으로 해당 팀을 시즌에 편입」,
-- 2026-09-26 수연 지시. 왜 참가 행이 아니라 링크인지는 schema.prisma의 LateEntryPass 주석.
--
-- 새 표만 만든다. 기존 표·열은 건드리지 않아 되돌릴 일이 생겨도 이 표만 지우면 된다.

-- CreateTable
CREATE TABLE "late_entry_passes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "season_id" UUID NOT NULL,
    "code" VARCHAR(12) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "used_by" UUID,
    "entry_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "late_entry_passes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "late_entry_passes_code_key" ON "late_entry_passes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "late_entry_passes_entry_id_key" ON "late_entry_passes"("entry_id");

-- CreateIndex
CREATE INDEX "late_entry_passes_season_id_created_at_idx" ON "late_entry_passes"("season_id", "created_at");

-- AddForeignKey
ALTER TABLE "late_entry_passes" ADD CONSTRAINT "late_entry_passes_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "late_entry_passes" ADD CONSTRAINT "late_entry_passes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "late_entry_passes" ADD CONSTRAINT "late_entry_passes_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "late_entry_passes" ADD CONSTRAINT "late_entry_passes_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
