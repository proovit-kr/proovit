/*
  Warnings:

  - Added the required column `age_confirmed` to the `leads` table without a default value. This is not possible if the table is not empty.
  - Added the required column `privacy_consent_version` to the `leads` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "age_confirmed" BOOLEAN NOT NULL,
ADD COLUMN     "marketing_consent_version" VARCHAR(20),
ADD COLUMN     "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketing_opt_in_at" TIMESTAMPTZ(6),
ADD COLUMN     "marketing_opt_out_at" TIMESTAMPTZ(6),
ADD COLUMN     "privacy_consent_version" VARCHAR(20) NOT NULL;
